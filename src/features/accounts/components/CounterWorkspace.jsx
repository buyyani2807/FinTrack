import { useMemo, useRef, useState } from "react";
import { Search, Trash2, Pause, Play, Plus, ShoppingCart } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { money } from "../accountsFormat.js";
import { todayIso } from "../../../lib/dates.js";
import {
  CASH_PARTY_ID,
  MONEY_MODES,
  entryPartyId,
  isReversed,
  newClientRequestId,
  roundMoney,
  voucherTotals,
} from "../model/accountingModel.js";
import { gstStateFromGstin, isIntraGst } from "../model/accountingGst.js";
import { emptyItemLine, itemizedEntryDraft, wholeQuantity } from "../model/inventoryModel.js";
import { resolveItemRate } from "../model/priceLists.js";
import { postVoucher } from "../data/accountingRepository.js";

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

/**
 * Retail Counter (POS) — till UI that posts into the same Accounts sale vouchers + stock.
 * Holds stay local until Charge; Cash party = walk-in.
 */
export function CounterWorkspace({
  token,
  canWrite = false,
  saving = false,
  accounts = [],
  items = [],
  stockByItem = {},
  parties = [],
  priceLists = [],
  vouchers = [],
  activeCompany = null,
  onPosted = null,
  onReprint = null,
  onOpenInventory = null,
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

  const customers = useMemo(
    () => (parties || []).filter(party => party.partyType === "customer" && party.isActive !== false),
    [parties],
  );
  const todayBills = useMemo(() => {
    const today = todayIso();
    return (vouchers || [])
      .filter(voucher => (
        voucher.sourceType === "pos_counter"
        && String(voucher.date || "").slice(0, 10) === today
        && !isReversed(voucher)
      ))
      .slice()
      .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")))
      .slice(0, 12);
  }, [vouchers]);
  const catalog = useMemo(() => matchItems(items, query), [items, query]);
  const gstEnabled = activeCompany?.gstRegistration === "regular";
  const selectedParty = partyId && partyId !== CASH_PARTY_ID
    ? customers.find(party => party.id === partyId)
    : null;
  const partyState = partyId === CASH_PARTY_ID
    ? (activeCompany?.stateCode || "")
    : (selectedParty?.stateCode || gstStateFromGstin(selectedParty?.gstin));
  const intra = isIntraGst(activeCompany?.stateCode, partyState);
  const totals = useMemo(
    () => estimateTotal(lines, { gstEnabled, intra }),
    [lines, gstEnabled, intra],
  );

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
      partyId,
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
    setPartyId(hold.partyId || CASH_PARTY_ID);
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
    const moneyParts = moneyMode === "cash_upi"
      ? { cash: Number(receivedCash || 0), upi: Number(receivedUpi || 0) }
      : null;
    setBusy(true);
    try {
      const draft = itemizedEntryDraft({
        kind: "sale",
        accounts,
        date: todayIso(),
        partyId: entryPartyId(partyId),
        moneyMode,
        moneyParts,
        settlement: "paid",
        narration: "Counter sale",
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
      setError(err?.message || "Could not post this bill.");
    } finally {
      setBusy(false);
    }
  };

  if (!canWrite) {
    return (
      <div className="acc-panel counter-workspace">
        <p className="copy">Counter is available to users who can post sales. Ask the owner for accountant access.</p>
      </div>
    );
  }

  return (
    <div className="acc-panel counter-workspace">
      <div className="counter-head">
        <div>
          <h1 className="accounts-panel-title">Counter</h1>
          <p className="copy">Fast billing for the till. Charged bills post into Accounts sales and stock — same books as the rest of FinTrack.</p>
        </div>
        <div className="counter-head-actions">
          {onOpenInventory ? (
            <button type="button" className="btn" onClick={onOpenInventory}>Items</button>
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

      {todayBills.length > 0 ? (
        <div className="counter-today" aria-label="Today's counter bills">
          <span className="small">Today</span>
          <ul className="counter-today-list">
            {todayBills.map(bill => (
              <li key={bill.id}>
                <button
                  type="button"
                  className="btn counter-today-chip"
                  disabled={!onReprint}
                  onClick={() => onReprint?.(bill.id)}
                >
                  {bill.reference || bill.voucherNumber || "Bill"} · {money(voucherTotals(bill.lines || []).debit)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {holds.length > 0 ? (
        <div className="counter-holds" aria-label="Held bills">
          {holds.map(hold => (
            <button key={hold.id} type="button" className="btn counter-hold-chip" onClick={() => recallHold(hold.id)}>
              <Play size={14} aria-hidden="true" /> {hold.label}
            </button>
          ))}
        </div>
      ) : null}

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
          <p className="small counter-search-hint">Scan a SKU or press Enter to add. Tap Add on a result to avoid mistakes.</p>
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
              value={partyId}
              onChange={event => setPartyId(event.target.value)}
              disabled={busy}
            >
              <option value={CASH_PARTY_ID}>Cash (walk-in)</option>
              {customers.map(party => (
                <option key={party.id} value={party.id}>{party.name}</option>
              ))}
            </Select>
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
            <button type="button" className="btn" disabled={!lines.length || busy} onClick={holdBill}>
              <Pause size={16} aria-hidden="true" /> Hold
            </button>
            <button type="button" className="btn primary counter-charge" disabled={!lines.length || busy || saving} onClick={charge}>
              {busy ? "Posting…" : `Charge ${money(totals.total)}`}
            </button>
          </div>
          <p className="small">Card machine or UPI app stays outside FinTrack — pick the mode after the customer pays. No payment gateway required.</p>
        </section>
      </div>
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
