import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2, Pause, Play, Plus, ShoppingCart, RotateCcw, Landmark } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { money } from "../accountsFormat.js";
import { todayIso } from "../../../lib/dates.js";
import {
  CASH_PARTY_ID,
  MONEY_MODES,
  entryPartyId,
  isCancelled,
  isReversed,
  newClientRequestId,
  roundMoney,
  voucherTotals,
} from "../model/accountingModel.js";
import { gstStateFromGstin, isIntraGst } from "../model/accountingGst.js";
import { emptyItemLine, itemizedEntryDraft, wholeQuantity } from "../model/inventoryModel.js";
import { resolveItemRate } from "../model/priceLists.js";
import { cancelVoucher, postVoucher } from "../data/accountingRepository.js";
import { readDayClose, saveDayClose } from "../model/counterSettings.js";

const PAY_MODES = MONEY_MODES.filter(mode => ["cash", "upi", "cash_upi", "bank"].includes(mode.id));

function lineNet(line) {
  const qty = Math.max(0, Math.trunc(Number(line.quantity || 0)));
  const rate = Number(line.rate || 0);
  const gross = roundMoney(qty * rate);
  const discText = String(line.discount || "").trim();
  let discount = 0;
  if (discText.endsWith("%")) {
    const pct = Number(discText.slice(0, -1));
    if (Number.isFinite(pct)) discount = roundMoney((gross * pct) / 100);
  } else if (discText) {
    const value = Number(discText);
    if (Number.isFinite(value)) discount = roundMoney(value);
  }
  return Math.max(0, roundMoney(gross - discount));
}

function estimateTotal(lines, { gstEnabled, intra }) {
  let taxable = 0;
  let tax = 0;
  for (const line of lines) {
    if (!line.itemId && !String(line.itemName || "").trim()) continue;
    const net = lineNet(line);
    taxable = roundMoney(taxable + net);
    if (gstEnabled) {
      const rate = Number(line.gstRate || 0);
      tax = roundMoney(tax + (net * rate) / 100);
    }
  }
  return {
    taxable,
    tax,
    total: roundMoney(taxable + tax),
    taxLabel: !gstEnabled ? "" : intra ? "GST (CGST+SGST)" : "GST (IGST)",
  };
}

function matchItems(items, query) {
  const q = String(query || "").trim().toLowerCase();
  const active = (items || []).filter(item => item.isActive !== false);
  if (!q) return active.slice(0, 40);
  return active.filter(item => (
    `${item.name} ${item.sku || ""} ${item.hsnSac || ""} ${item.description || ""}`
      .toLowerCase()
      .includes(q)
  )).slice(0, 40);
}

function emptyHold() {
  return { id: newClientRequestId(), label: "", lines: [], partyId: CASH_PARTY_ID, moneyMode: "cash", receivedCash: "", receivedUpi: "" };
}

function billTotal(voucher) {
  return voucherTotals(voucher.lines || []).debit;
}

function isCashHeavy(voucher) {
  const narration = String(voucher.narration || "").toLowerCase();
  return /cash/.test(narration) || voucher.moneyMode === "cash";
}

/**
 * Retail Counter (POS) — Phase 2: holds, history/void, day-close, shortcuts.
 * Charge posts into the same Accounts sale vouchers + stock.
 */
export function CounterWorkspace({
  token,
  canWrite = false,
  canManage = false,
  cashierMode = false,
  saving = false,
  accounts = [],
  items = [],
  stockByItem = {},
  parties = [],
  priceLists = [],
  vouchers = [],
  activeCompany = null,
  counterSettings = null,
  onPosted = null,
  onReprint = null,
  onOpenInventory = null,
  onRefresh = null,
  askReason = null,
}) {
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState([]);
  const [partyId, setPartyId] = useState(CASH_PARTY_ID);
  const [moneyMode, setMoneyMode] = useState("cash");
  const [receivedCash, setReceivedCash] = useState("");
  const [receivedUpi, setReceivedUpi] = useState("");
  const [holds, setHolds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastBill, setLastBill] = useState(null);
  const [panel, setPanel] = useState("bill"); // bill | close
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const today = todayIso();
  const companyId = activeCompany?.id || null;
  const tillLabel = counterSettings?.tillLabel || "Till 1";
  const closed = companyId ? readDayClose(companyId, today) : null;

  // Cashiers bill walk-in by default; named customers stay available for credit/named sales.
  // Inventory / party master screens stay closed — this list is till-only.
  const customers = useMemo(
    () => (parties || []).filter(party => (
      party.partyType === "customer"
      && party.isActive !== false
      && !/^suspense(\s+account)?$/i.test(String(party.name || "").trim())
    )),
    [parties],
  );
  const todayBills = useMemo(() => {
    return (vouchers || [])
      .filter(voucher => (
        voucher.sourceType === "pos_counter"
        && String(voucher.date || "").slice(0, 10) === today
        && !isReversed(voucher)
        && !isCancelled(voucher)
      ))
      .slice()
      .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")))
      .slice(0, 40);
  }, [vouchers, today]);
  const catalog = useMemo(() => matchItems(items, query), [items, query]);
  const gstEnabled = activeCompany?.gstRegistration === "regular";
  const billingPartyId = cashierMode ? CASH_PARTY_ID : partyId;
  const selectedParty = billingPartyId && billingPartyId !== CASH_PARTY_ID
    ? customers.find(party => party.id === billingPartyId)
    : null;
  const partyState = billingPartyId === CASH_PARTY_ID
    ? (activeCompany?.stateCode || "")
    : (selectedParty?.stateCode || gstStateFromGstin(selectedParty?.gstin));
  const intra = isIntraGst(activeCompany?.stateCode, partyState);
  const totals = useMemo(
    () => estimateTotal(lines, { gstEnabled, intra }),
    [lines, gstEnabled, intra],
  );
  const expectedCash = useMemo(() => {
    const sales = todayBills.reduce((sum, bill) => {
      const total = billTotal(bill);
      // Paid counter sales: treat cash / cash_upi cash side as drawer cash when narration marks cash.
      if (isCashHeavy(bill) || /cash \+ upi|cash_upi/i.test(String(bill.narration || ""))) {
        return roundMoney(sum + total);
      }
      return sum;
    }, 0);
    return roundMoney(Number(openingFloat || closed?.openingFloat || 0) + sales);
  }, [todayBills, openingFloat, closed]);
  const variance = roundMoney(Number(countedCash || 0) - expectedCash);

  useEffect(() => {
    if (closed) {
      setOpeningFloat(String(closed.openingFloat ?? ""));
      setCountedCash(String(closed.countedCash ?? ""));
      setCloseReason(closed.reason || "");
    }
  }, [closed?.closedAt]);

  const addItem = item => {
    if (!item?.id || !canWrite) return;
    setError("");
    const stock = Number(stockByItem[item.id] ?? 0);
    setLines(current => {
      const existing = current.findIndex(line => line.itemId === item.id);
      if (existing >= 0) {
        return current.map((line, index) => {
          if (index !== existing) return line;
          const nextQty = Math.trunc(Number(line.quantity || 0)) + 1;
          return { ...line, quantity: String(nextQty) };
        });
      }
      const resolved = resolveItemRate({ item, party: selectedParty, lists: priceLists, kind: "selling" });
      const rate = resolved?.rate ?? item.sellingPrice ?? 0;
      return [
        ...current,
        {
          ...emptyItemLine(),
          itemId: item.id,
          itemName: item.name,
          itemSku: item.sku || "",
          itemType: item.itemType || "product",
          unit: item.unit || "Nos",
          quantity: "1",
          rate: String(rate ?? ""),
          gstRate: String(item.gstRate ?? 18),
          hsnSac: item.hsnSac || "",
          _stock: stock,
        },
      ];
    });
    setQuery("");
    searchRef.current?.focus();
  };

  const tryAddFromQuery = () => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return;
    const exactSku = (items || []).find(item => item.isActive !== false && String(item.sku || "").toLowerCase() === q);
    if (exactSku) {
      addItem(exactSku);
      return;
    }
    if (catalog.length === 1) addItem(catalog[0]);
  };

  const patchLine = (index, patch) => {
    setLines(current => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = index => {
    setLines(current => current.filter((_, i) => i !== index));
  };

  const clearBill = () => {
    setLines([]);
    setPartyId(CASH_PARTY_ID);
    setMoneyMode("cash");
    setReceivedCash("");
    setReceivedUpi("");
    setError("");
  };

  const holdBill = () => {
    if (!lines.length) {
      setError("Add items before holding a bill.");
      return;
    }
    const hold = {
      ...emptyHold(),
      label: `Hold ${holds.length + 1} · ${lines.length} item${lines.length === 1 ? "" : "s"} · ${money(totals.total)}`,
      lines,
      partyId: billingPartyId,
      moneyMode,
      receivedCash,
      receivedUpi,
    };
    setHolds(current => [hold, ...current]);
    clearBill();
  };

  const recallHold = holdId => {
    const hold = holds.find(row => row.id === holdId);
    if (!hold) return;
    if (lines.length) {
      setError("Charge or hold the current bill before recalling another.");
      return;
    }
    setLines(hold.lines);
    setPartyId(cashierMode ? CASH_PARTY_ID : (hold.partyId || CASH_PARTY_ID));
    setMoneyMode(hold.moneyMode || "cash");
    setReceivedCash(hold.receivedCash || "");
    setReceivedUpi(hold.receivedUpi || "");
    setHolds(current => current.filter(row => row.id !== holdId));
    setError("");
  };

  const charge = async () => {
    if (!canWrite || busy || saving) return;
    setError("");
    if (!lines.length) {
      setError("Add at least one item.");
      return;
    }
    if (closed) {
      setError("Today’s till is closed. Re-open day-close only if the owner needs a correction.");
      return;
    }
    const moneyParts = moneyMode === "cash_upi"
      ? { cash: Number(receivedCash || 0), upi: Number(receivedUpi || 0) }
      : null;
    setBusy(true);
    try {
      const draft = itemizedEntryDraft({
        kind: "sale",
        accounts,
        date: today,
        partyId: entryPartyId(billingPartyId),
        moneyMode,
        moneyParts,
        settlement: "paid",
        narration: `Counter sale · ${tillLabel} · ${PAY_MODES.find(mode => mode.id === moneyMode)?.label || moneyMode}`,
        itemLines: lines,
        intra,
        taxInclusive: false,
        gstEnabled,
      });
      const voucherId = await postVoucher(token, {
        ...draft,
        clientRequestId: newClientRequestId(),
        sourceModule: "accounts",
        sourceType: "pos_counter",
      });
      const total = voucherTotals(draft.lines).debit;
      setLastBill({
        voucherId,
        total,
        at: new Date().toISOString(),
        lines: lines.length,
      });
      clearBill();
      onPosted?.(voucherId);
    } catch (err) {
      const detail = err?.details || err?.cause?.message || err?.hint;
      const main = err?.message || "Could not post this bill.";
      setError(detail && detail !== main ? `${main} (${detail})` : main);
    } finally {
      setBusy(false);
    }
  };

  const actionsRef = useRef({ charge, holdBill });
  actionsRef.current = { charge, holdBill };
  useEffect(() => {
    const onKey = event => {
      const inField = event.target?.closest?.("input, textarea, select");
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === "F4" && !inField) {
        event.preventDefault();
        actionsRef.current.holdBill();
        return;
      }
      if (event.key === "F9") {
        event.preventDefault();
        actionsRef.current.charge();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const voidBill = bill => {
    if (!canManage || !askReason || !bill?.id) return;
    askReason("Void counter bill", "Void bill", reason => (async () => {
      setBusy(true);
      setError("");
      try {
        await cancelVoucher(token, bill.id, reason || "Counter void");
        onRefresh?.();
      } catch (err) {
        setError(err?.message || "Could not void this bill.");
      } finally {
        setBusy(false);
      }
    })());
  };

  const saveClose = () => {
    if (!canManage || !companyId) return;
    if (!String(countedCash).trim()) {
      setError("Enter counted cash in the drawer.");
      return;
    }
    if (variance !== 0 && !String(closeReason || "").trim()) {
      setError("Enter a reason when counted cash differs from expected.");
      return;
    }
    saveDayClose(companyId, today, {
      tillLabel,
      openingFloat: Number(openingFloat || 0),
      expectedCash,
      countedCash: Number(countedCash || 0),
      variance,
      reason: closeReason || "",
      billCount: todayBills.length,
    });
    setError("");
    setPanel("bill");
  };

  if (!canWrite) {
    return (
      <div className="acc-panel counter-workspace">
        <p className="copy">Counter is available to users who can post sales. Ask the owner for cashier or accountant access.</p>
      </div>
    );
  }

  return (
    <div className="acc-panel counter-workspace">
      <div className="counter-head">
        <div>
          <h1 className="accounts-panel-title">Counter</h1>
          <p className="copy">Fast billing for the till ({tillLabel}). Charged bills post into Accounts sales and stock — same books as the rest of FinTrack.</p>
        </div>
        <div className="counter-head-actions">
          {onOpenInventory ? (
            <button type="button" className="btn" onClick={onOpenInventory}>Items</button>
          ) : null}
          {canManage ? (
            <button type="button" className={`btn${panel === "close" ? " primary" : ""}`} onClick={() => setPanel(current => (current === "close" ? "bill" : "close"))}>
              <Landmark size={16} aria-hidden="true" /> {panel === "close" ? "Back to till" : "Day close"}
            </button>
          ) : null}
          {lastBill ? (
            <span className="small counter-last-bill">
              Last bill {money(lastBill.total)} · {lastBill.lines} item{lastBill.lines === 1 ? "" : "s"}
              {onReprint && lastBill.voucherId ? (
                <>
                  {" · "}
                  <button type="button" className="link-button" onClick={() => onReprint(lastBill.voucherId)}>Print</button>
                </>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      {error ? <p className="acc-form-error" role="alert">{error}</p> : null}
      {closed ? <p className="notice" role="status">Till closed for today · expected {money(closed.expectedCash)} · counted {money(closed.countedCash)} · variance {money(closed.variance)}</p> : null}

      {panel === "close" ? (
        <section className="counter-dayclose card">
          <h2 className="acc-subsection-title">Day close · {tillLabel}</h2>
          <p className="copy">Compare drawer cash to Counter cash sales for {today}. Shortage/overage is recorded on this device for the owner — it does not auto-post a journal yet.</p>
          <div className="form counter-dayclose-form">
            <FieldBlock label="Opening float">
              <input type="number" min="0" step="0.01" value={openingFloat} onChange={event => setOpeningFloat(event.target.value)} disabled={Boolean(closed)} />
            </FieldBlock>
            <FieldBlock label="Expected cash (float + cash bills)">
              <input readOnly value={expectedCash} />
            </FieldBlock>
            <FieldBlock label="Counted cash">
              <input type="number" min="0" step="0.01" value={countedCash} onChange={event => setCountedCash(event.target.value)} disabled={Boolean(closed)} />
            </FieldBlock>
            <FieldBlock label="Variance">
              <input readOnly value={variance} />
            </FieldBlock>
            <FieldBlock label="Reason (if variance)">
              <input value={closeReason} onChange={event => setCloseReason(event.target.value)} disabled={Boolean(closed)} placeholder="Shortage / overage note" />
            </FieldBlock>
          </div>
          <p className="small">{todayBills.length} counter bill{todayBills.length === 1 ? "" : "s"} today.</p>
          {!closed ? (
            <button type="button" className="btn primary" onClick={saveClose}>Close till for today</button>
          ) : (
            <p className="small">Already closed at {new Date(closed.closedAt).toLocaleString("en-IN")}.</p>
          )}
        </section>
      ) : null}

      {panel === "bill" && todayBills.length > 0 ? (
        <div className="counter-today" aria-label="Today's counter bills">
          <span className="small">Today</span>
          <ul className="counter-today-list">
            {todayBills.map(bill => (
              <li key={bill.id} className="counter-today-row">
                <button
                  type="button"
                  className="btn counter-today-chip"
                  disabled={!onReprint}
                  onClick={() => onReprint?.(bill.id)}
                >
                  {bill.reference || bill.voucherNumber || "Bill"} · {money(billTotal(bill))}
                </button>
                {canManage ? (
                  <button type="button" className="btn counter-void" disabled={busy} onClick={() => voidBill(bill)} title="Void bill">
                    <RotateCcw size={14} aria-hidden="true" /> Void
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {panel === "bill" && holds.length > 0 ? (
        <div className="counter-holds" aria-label="Held bills">
          {holds.map(hold => (
            <button key={hold.id} type="button" className="btn counter-hold-chip" onClick={() => recallHold(hold.id)}>
              <Play size={14} aria-hidden="true" /> {hold.label}
            </button>
          ))}
        </div>
      ) : null}

      {panel === "bill" ? (
      <div className="counter-grid">
        <section className="counter-catalog card">
          <label className="counter-search">
            <Search size={18} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  tryAddFromQuery();
                }
              }}
              placeholder="Search name or scan SKU — Enter adds"
              aria-label="Search items or scan SKU"
              autoFocus
            />
          </label>
          <p className="small counter-search-hint">Scan a SKU or press Enter to add. Tap Add on a result. Shortcuts: F2 search · F4 hold · F9 charge.</p>
          {!items.length ? (
            <p className="copy counter-empty">
              No items yet. Add products under Inventory, then return here to bill.
              {onOpenInventory ? (
                <>
                  {" "}
                  <button type="button" className="link-button" onClick={onOpenInventory}>Open Inventory</button>
                </>
              ) : null}
            </p>
          ) : (
            <ul className="counter-item-list">
              {catalog.map(item => {
                const stock = Number(stockByItem[item.id] ?? 0);
                const low = item.itemType !== "service" && stock <= 0;
                return (
                  <li key={item.id} className={`counter-item${low ? " is-low" : ""}`}>
                    <div className="counter-item-copy">
                      <span className="counter-item-name">{item.name}</span>
                      <span className="small">{item.sku || "No SKU"}{item.itemType !== "service" ? ` · Stock ${stock}` : ""}</span>
                    </div>
                    <strong className="counter-item-price">{money(item.sellingPrice || 0)}</strong>
                    <button
                      type="button"
                      className="btn counter-item-add"
                      onClick={() => addItem(item)}
                      aria-label={`Add ${item.name} to bill`}
                    >
                      <Plus size={16} aria-hidden="true" /> Add
                    </button>
                  </li>
                );
              })}
              {!catalog.length ? <li className="small">No matching items. Type a name or scan a SKU, then press Enter.</li> : null}
            </ul>
          )}
        </section>

        <section className="counter-cart card">
          <div className="counter-cart-head">
            <strong><ShoppingCart size={16} aria-hidden="true" /> Bill</strong>
            <button type="button" className="btn" disabled={!lines.length || busy} onClick={clearBill}>Clear</button>
          </div>
          {!lines.length ? (
            <p className="copy counter-empty">Tap or scan items to build the bill.</p>
          ) : (
            <ul className="counter-line-list">
              {lines.map((line, index) => (
                <li key={`${line.itemId}-${index}`} className="counter-line">
                  <div className="counter-line-main">
                    <strong>{line.itemName}</strong>
                    <span className="small">{line.itemSku || ""}{line._stock != null ? ` · Stock ${line._stock}` : ""}</span>
                  </div>
                  <input
                    className="counter-qty"
                    inputMode="numeric"
                    aria-label={`Quantity for ${line.itemName}`}
                    value={line.quantity}
                    onChange={event => patchLine(index, { quantity: wholeQuantity(event.target.value) || "0" })}
                  />
                  <span className="counter-line-rate">{money(line.rate)}</span>
                  <strong className="counter-line-net">{money(lineNet(line))}</strong>
                  <button type="button" className="btn counter-line-remove" aria-label={`Remove ${line.itemName}`} onClick={() => removeLine(index)}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="counter-pay card">
          <FieldBlock label="Customer">
            <Select
              aria-label="Customer"
              value={billingPartyId}
              onChange={event => setPartyId(event.target.value)}
              disabled={busy || cashierMode}
            >
              <option value={CASH_PARTY_ID}>Cash (walk-in)</option>
              {!cashierMode ? customers.map(party => (
                <option key={party.id} value={party.id}>{party.name}</option>
              )) : null}
            </Select>
            {cashierMode ? <p className="small">Walk-in only for cashier. Ask an accountant to bill a named customer on credit.</p> : null}
          </FieldBlock>
          <FieldBlock label="Payment">
            <Select
              aria-label="Payment mode"
              value={moneyMode}
              onChange={event => setMoneyMode(event.target.value)}
              disabled={busy}
            >
              {PAY_MODES.map(mode => (
                <option key={mode.id} value={mode.id}>{mode.label}</option>
              ))}
            </Select>
          </FieldBlock>
          {moneyMode === "cash_upi" ? (
            <div className="counter-split">
              <FieldBlock label="Cash">
                <input type="number" min="0" step="0.01" value={receivedCash} onChange={event => setReceivedCash(event.target.value)} />
              </FieldBlock>
              <FieldBlock label="UPI">
                <input type="number" min="0" step="0.01" value={receivedUpi} onChange={event => setReceivedUpi(event.target.value)} />
              </FieldBlock>
            </div>
          ) : null}

          <div className="counter-totals">
            <div><span>Taxable</span><strong>{money(totals.taxable)}</strong></div>
            {gstEnabled ? <div><span>{totals.taxLabel || "GST"}</span><strong>{money(totals.tax)}</strong></div> : null}
            <div className="counter-total-due"><span>Total</span><strong>{money(totals.total)}</strong></div>
          </div>

          <div className="counter-pay-actions">
            <button type="button" className="btn" disabled={!lines.length || busy || Boolean(closed)} onClick={holdBill}>
              <Pause size={16} aria-hidden="true" /> Hold
            </button>
            <button type="button" className="btn primary counter-charge" disabled={!lines.length || busy || saving || Boolean(closed)} onClick={charge}>
              {busy ? "Posting…" : `Charge ${money(totals.total)}`}
            </button>
          </div>
          <p className="small">Card machine or UPI app stays outside FinTrack — pick the mode after the customer pays. No payment gateway required.</p>
        </section>
      </div>
      ) : null}
    </div>
  );
}

function FieldBlock({ label, children }) {
  return (
    <label className="counter-field">
      <span className="small">{label}</span>
      {children}
    </label>
  );
}
