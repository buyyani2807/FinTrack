import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2, Pause, Play, Plus, ShoppingCart, RotateCcw, Landmark, ScrollText } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { money } from "../accountsFormat.js";
import { todayIso } from "../../../lib/dates.js";
import {
  CASH_PARTY_ID,
  entryPartyId,
  isCancelled,
  isReversed,
  newClientRequestId,
  roundMoney,
  voucherTotals,
} from "../model/accountingModel.js";
import { gstStateFromGstin, isIntraGst } from "../model/accountingGst.js";
import { emptyItemForm, emptyItemLine, itemizedEntryDraft, itemToForm, validateItemForm, wholeQuantity } from "../model/inventoryModel.js";
import { resolveItemRate } from "../model/priceLists.js";
import { cancelVoucher, postVoucher } from "../data/accountingRepository.js";
import {
  itemExpiryStatus,
  readCounterSession,
  readDayClose,
  saveCounterSession,
  saveDayClose,
} from "../model/counterSettings.js";
import {
  COUNTER_PAY_MODES,
  counterDayReport,
  counterDayReportAll,
  counterPayLabel,
  tillNeedle,
} from "../model/counterDayReport.js";
import {
  counterDayCloseCoach,
  counterSessionAdvisories,
} from "../model/counterAi.js";
import { formatReceiptDateTime } from "../../receipts/model/receiptModel.js";
import { ItemFormDialog } from "./items/ItemFormDialog.jsx";

const PAY_MODES = COUNTER_PAY_MODES;

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
  // Search/scan first — do not dump the catalog when the box is empty.
  if (!q) return [];
  return (items || []).filter(item => (
    item.isActive !== false
    && `${item.name} ${item.sku || ""} ${item.barcode || ""} ${item.brand || ""} ${item.hsnSac || ""} ${item.description || ""}`
      .toLowerCase()
      .includes(q)
  )).slice(0, 40);
}

function findItemByCode(items, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;
  return (items || []).find(item => (
    item.isActive !== false
    && (
      String(item.sku || "").toLowerCase() === q
      || String(item.barcode || "").toLowerCase() === q
    )
  )) || null;
}

function emptyHold() {
  return { id: newClientRequestId(), label: "", lines: [], partyId: CASH_PARTY_ID, moneyMode: "cash", receivedCash: "", receivedUpi: "" };
}

function billTotal(voucher) {
  return voucherTotals(voucher.lines || []).debit;
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
  itemCategories = [],
  stockByItem = {},
  stockMovements = [],
  parties = [],
  priceLists = [],
  vouchers = [],
  activeCompany = null,
  counterSettings = null,
  onCounterSettingsChange = null,
  onPosted = null,
  onReprint = null,
  onOpenInventory = null,
  onSaveItem = null,
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
  const [panel, setPanel] = useState("bill"); // bill | close | report
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemFormError, setItemFormError] = useState("");
  const canAddItems = Boolean(onSaveItem) && !cashierMode;
  const [closeReason, setCloseReason] = useState("");
  const [cashierName, setCashierName] = useState("");
  const [reportDate, setReportDate] = useState(() => todayIso());
  const [reportTillScope, setReportTillScope] = useState("active"); // active | all
  const today = todayIso();
  const companyId = activeCompany?.id || null;
  const tills = counterSettings?.tills?.length ? counterSettings.tills : [{ id: "till-1", label: counterSettings?.tillLabel || "Till 1" }];
  const activeTillId = tills.some(till => till.id === counterSettings?.activeTillId) ? counterSettings.activeTillId : tills[0].id;
  const tillLabel = tills.find(till => till.id === activeTillId)?.label || "Till 1";
  const closed = companyId ? readDayClose(companyId, today, activeTillId) : null;

  const todayBills = useMemo(() => {
    const needle = tillNeedle(tillLabel);
    return (vouchers || [])
      .filter(voucher => (
        voucher.sourceType === "pos_counter"
        && String(voucher.date || "").slice(0, 10) === today
        && !isReversed(voucher)
        && !isCancelled(voucher)
        && String(voucher.narration || "").toLowerCase().includes(needle)
      ))
      .slice()
      .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")))
      .slice(0, 40);
  }, [vouchers, today, tillLabel]);
  const dayReport = useMemo(() => {
    const date = reportDate || today;
    if (reportTillScope === "all") {
      return counterDayReportAll(accounts, vouchers, { date, tills });
    }
    return counterDayReport(accounts, vouchers, { date, tillLabel });
  }, [accounts, vouchers, reportDate, today, tillLabel, reportTillScope, tills]);
  const todayCloseReport = useMemo(
    () => counterDayReport(accounts, vouchers, { date: today, tillLabel }),
    [accounts, vouchers, today, tillLabel],
  );
  const catalog = useMemo(() => matchItems(items, query), [items, query]);
  const gstEnabled = activeCompany?.gstRegistration === "regular";
  // Counter is walk-in only — named credit parties stay in Accounts sales.
  const billingPartyId = CASH_PARTY_ID;
  const selectedParty = null;

  useEffect(() => {
    if (!companyId) {
      setCashierName("");
      return;
    }
    setCashierName(readCounterSession(companyId).cashierName || "");
  }, [companyId]);

  // When the customer changes, refresh list rates unless the cashier typed a custom rate.
  useEffect(() => {
    setLines(current => {
      if (!current.length) return current;
      let changed = false;
      const next = current.map(line => {
        if (line.rateTouched || !line.itemId) return line;
        const item = (items || []).find(row => row.id === line.itemId);
        if (!item) return line;
        const resolved = resolveItemRate({ item, party: selectedParty, lists: priceLists, kind: "selling" });
        const rate = String(resolved?.rate ?? item.sellingPrice ?? "");
        if (rate === String(line.rate ?? "") && line._rateSource === resolved.source) return line;
        changed = true;
        return { ...line, rate, _rateSource: resolved.source, _rateList: resolved.listName || "" };
      });
      return changed ? next : current;
    });
  }, [billingPartyId, selectedParty, priceLists, items]);
  const partyState = billingPartyId === CASH_PARTY_ID
    ? (activeCompany?.stateCode || "")
    : (selectedParty?.stateCode || gstStateFromGstin(selectedParty?.gstin));
  const intra = isIntraGst(activeCompany?.stateCode, partyState);
  const totals = useMemo(
    () => estimateTotal(lines, { gstEnabled, intra }),
    [lines, gstEnabled, intra],
  );
  const expectedCash = useMemo(() => {
    // Drawer cash = opening float + cash portion of Counter tenders (not full Cash+UPI bills).
    const cashSales = todayCloseReport.tender.cash;
    return roundMoney(Number(openingFloat || closed?.openingFloat || 0) + cashSales);
  }, [todayCloseReport, openingFloat, closed]);
  const variance = roundMoney(Number(countedCash || 0) - expectedCash);
  const sessionTips = useMemo(
    () => counterSessionAdvisories({
      items,
      stockByItem,
      stockMovements,
      lines,
      vouchers,
      tillLabel,
      today,
      cartTotal: totals.total,
    }),
    [items, stockByItem, stockMovements, lines, vouchers, tillLabel, today, totals.total],
  );
  const closeTips = useMemo(
    () => counterDayCloseCoach({
      report: todayCloseReport,
      openingFloat: Number(openingFloat || closed?.openingFloat || 0),
      countedCash: Number(countedCash || 0),
      expectedCash,
      variance,
    }),
    [todayCloseReport, openingFloat, countedCash, expectedCash, variance, closed],
  );

  useEffect(() => {
    if (closed) {
      setOpeningFloat(String(closed.openingFloat ?? ""));
      setCountedCash(String(closed.countedCash ?? ""));
      setCloseReason(closed.reason || "");
    }
  }, [closed?.closedAt]);

  const addItem = item => {
    if (!item?.id || !canWrite) return;
    const expiry = itemExpiryStatus(item.expiryDate, { today });
    if (expiry.tone === "expired") {
      setError(`${item.name} is past expiry (${item.expiryDate}). Choose another batch or update the item.`);
      return;
    }
    setError(expiry.tone === "soon" ? `${item.name}: ${expiry.label}.` : "");
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
          _rateSource: resolved.source,
          _rateList: resolved.listName || "",
          _batchNo: item.batchNo || "",
          _expiryDate: item.expiryDate || "",
        },
      ];
    });
    setQuery("");
    searchRef.current?.focus();
  };

  const openCreateItem = (prefill = {}) => {
    if (!canAddItems) return;
    const code = String(prefill.sku || prefill.barcode || query || "").trim();
    setItemForm(itemToForm({}, {
      sku: code,
      barcode: code && /^\d{8,}$/.test(code) ? code : (prefill.barcode || ""),
      name: prefill.name || "",
    }));
    setItemFormError("");
    setShowItemForm(true);
  };

  const saveCounterItem = async () => {
    if (!onSaveItem) return;
    const message = validateItemForm(itemForm);
    if (message) {
      setItemFormError(message);
      return;
    }
    setItemFormError("");
    await onSaveItem(itemForm);
    setShowItemForm(false);
    setItemForm(emptyItemForm());
    setQuery("");
    searchRef.current?.focus();
  };

  const tryAddFromQuery = () => {
    const q = String(query || "").trim();
    if (!q) return;
    const exact = findItemByCode(items, q);
    if (exact) {
      addItem(exact);
      return;
    }
    if (catalog.length === 1) {
      addItem(catalog[0]);
      return;
    }
    if (canAddItems && !catalog.length) openCreateItem({ sku: q, barcode: q });
  };

  const patchLine = (index, patch) => {
    setLines(current => current.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "rate")) next.rateTouched = true;
      return next;
    }));
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
    setPartyId(CASH_PARTY_ID);
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
        narration: [
          `Counter sale · ${tillLabel}`,
          cashierName ? `Cashier ${cashierName}` : "",
          counterPayLabel(moneyMode),
        ].filter(Boolean).join(" · "),
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
      tillId: activeTillId,
      tillLabel,
      cashierName: cashierName || "",
      openingFloat: Number(openingFloat || 0),
      expectedCash,
      countedCash: Number(countedCash || 0),
      variance,
      reason: closeReason || "",
      billCount: todayBills.length,
    }, activeTillId);
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
        <div className="counter-head-main">
          <p className="counter-eyebrow">Point of sale</p>
          <h1 className="accounts-panel-title">Counter</h1>
          <div className="counter-session">
            {tills.length > 1 || onCounterSettingsChange ? (
              <label className="counter-session-chip">
                <span className="small">Till</span>
                <Select
                  aria-label="Active till"
                  value={activeTillId}
                  onChange={event => onCounterSettingsChange?.({ ...counterSettings, activeTillId: event.target.value })}
                  disabled={!onCounterSettingsChange || tills.length < 2}
                >
                  {tills.map(till => (
                    <option key={till.id} value={till.id}>{till.label}</option>
                  ))}
                </Select>
              </label>
            ) : (
              <span className="counter-session-pill small">Till · {tillLabel}</span>
            )}
            <label className="counter-session-chip">
              <span className="small">Cashier</span>
              <input
                value={cashierName}
                placeholder="Name"
                onChange={event => {
                  const value = event.target.value;
                  setCashierName(value);
                  if (companyId) saveCounterSession(companyId, { cashierName: value });
                }}
              />
            </label>
            {lastBill ? (
              <span className="counter-session-pill counter-last-bill">
                <span className="small">Last {money(lastBill.total)}</span>
                {onReprint && lastBill.voucherId ? (
                  <button type="button" className="link-button counter-last-print" onClick={() => onReprint(lastBill.voucherId)}>Print</button>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
        <div className="counter-head-actions">
          {canAddItems ? (
            <button type="button" className="btn primary" onClick={() => openCreateItem()}>+ Item</button>
          ) : null}
          {onOpenInventory ? (
            <button type="button" className="btn" onClick={onOpenInventory}>Items</button>
          ) : null}
          <button
            type="button"
            className={`btn${panel === "report" ? " primary" : ""}`}
            onClick={() => setPanel(current => (current === "report" ? "bill" : "report"))}
          >
            <ScrollText size={16} aria-hidden="true" /> {panel === "report" ? "Back to till" : "Day report"}
          </button>
          {canManage ? (
            <button type="button" className={`btn${panel === "close" ? " primary" : ""}`} onClick={() => setPanel(current => (current === "close" ? "bill" : "close"))}>
              <Landmark size={16} aria-hidden="true" /> {panel === "close" ? "Back to till" : "Day close"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="acc-form-error" role="alert">{error}</p> : null}
      {closed ? <p className="notice" role="status">Till closed for today · expected {money(closed.expectedCash)} · counted {money(closed.countedCash)} · variance {money(closed.variance)}</p> : null}
      {panel === "bill" && sessionTips.length ? (
        <ul className="counter-ai-tips" aria-label="Counter advisories">
          {sessionTips.map(tip => (
            <li key={tip.id} className={`counter-ai-tip is-${tip.severity}`}>
              <strong>{tip.title}</strong>
              <span className="small">{tip.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {panel === "report" ? (
        <section className="counter-dayreport card" aria-label="Counter day report">
          <div className="counter-dayreport-head">
            <div>
              <h2 className="acc-subsection-title">
                Day report · {reportTillScope === "all" ? "All tills" : tillLabel}
              </h2>
              <p className="copy">
                {reportTillScope === "all"
                  ? "Combined Counter sales for every till. Accounts credit sales stay on Receivables / Sales reports."
                  : "Counter sales only for this till. Accounts credit sales stay on Receivables / Sales reports."}
              </p>
            </div>
            <div className="counter-dayreport-filters">
              <label className="counter-field">
                <span className="small">Tills</span>
                <Select
                  aria-label="Report till scope"
                  value={reportTillScope}
                  onChange={event => setReportTillScope(event.target.value)}
                >
                  <option value="active">This till · {tillLabel}</option>
                  <option value="all">All tills</option>
                </Select>
              </label>
              <label className="counter-field counter-dayreport-date">
                <span className="small">Date</span>
                <input
                  type="date"
                  value={reportDate || today}
                  max={today}
                  onChange={event => setReportDate(event.target.value || today)}
                />
              </label>
            </div>
          </div>
          <div className="counter-dayreport-kpis" aria-label="Sales summary">
            <article className="counter-dayreport-kpi">
              <span>Bills</span>
              <strong>{dayReport.billCount}</strong>
            </article>
            <article className="counter-dayreport-kpi tone-sales">
              <span>Total sales</span>
              <strong>{money(dayReport.sales)}</strong>
            </article>
            <article className="counter-dayreport-kpi">
              <span>Cash</span>
              <strong>{money(dayReport.tender.cash)}</strong>
            </article>
            <article className="counter-dayreport-kpi">
              <span>UPI</span>
              <strong>{money(dayReport.tender.upi)}</strong>
            </article>
            <article className="counter-dayreport-kpi">
              <span>Card</span>
              <strong>{money(dayReport.tender.card)}</strong>
            </article>
          </div>
          {reportTillScope === "all" && dayReport.byTill?.length ? (
            <div className="table spacer acc-table-wrap counter-dayreport-table" aria-label="Per-till totals">
              <table>
                <thead>
                  <tr>
                    <th>Till</th>
                    <th className="acc-num">Bills</th>
                    <th className="acc-num">Cash</th>
                    <th className="acc-num">UPI</th>
                    <th className="acc-num">Card</th>
                    <th className="acc-num">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {dayReport.byTill.map(row => (
                    <tr key={row.tillId || row.tillLabel}>
                      <td>{row.tillLabel || "Till"}</td>
                      <td className="acc-num">{row.billCount}</td>
                      <td className="acc-num">{money(row.tender.cash)}</td>
                      <td className="acc-num">{money(row.tender.upi)}</td>
                      <td className="acc-num">{money(row.tender.card)}</td>
                      <td className="acc-num">{money(row.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {dayReport.bills.length ? (
            <div className="table spacer acc-table-wrap counter-dayreport-table">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    {reportTillScope === "all" ? <th>Till</th> : null}
                    <th>Invoice</th>
                    <th>Mode</th>
                    <th className="acc-num">Cash</th>
                    <th className="acc-num">UPI</th>
                    <th className="acc-num">Card</th>
                    <th className="acc-num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {dayReport.bills.map(bill => (
                    <tr key={bill.id}>
                      <td>{bill.soldAt ? formatReceiptDateTime(bill.soldAt) : bill.invoiceDate}</td>
                      {reportTillScope === "all" ? <td>{bill.tillLabel || "—"}</td> : null}
                      <td>{bill.reference || "Bill"}</td>
                      <td>{bill.modeLabel}</td>
                      <td className="acc-num">{bill.cash ? money(bill.cash) : "—"}</td>
                      <td className="acc-num">{bill.upi ? money(bill.upi) : "—"}</td>
                      <td className="acc-num">{bill.card ? money(bill.card) : "—"}</td>
                      <td className="acc-num">{money(bill.amount)}</td>
                      <td className="acc-num">
                        {onReprint ? (
                          <button type="button" className="btn" onClick={() => onReprint(bill.id)}>Print</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small">
              No Counter bills
              {reportTillScope === "all" ? "" : ` for this till`}
              {" "}on {reportDate || today}.
            </p>
          )}
        </section>
      ) : null}

      {panel === "close" ? (
        <section className="counter-dayclose card">
          <h2 className="acc-subsection-title">Day close · {tillLabel}</h2>
          <p className="copy">Compare drawer cash to Counter cash sales for {today}. Shortage/overage is recorded on this device for the owner — it does not auto-post a journal yet.</p>
          {closeTips.length ? (
            <ul className="counter-ai-tips" aria-label="Day-close coach">
              {closeTips.map(tip => (
                <li key={tip.id} className={`counter-ai-tip is-${tip.severity}`}>
                  <strong>{tip.title}</strong>
                  <span className="small">{tip.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
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
        <section className="counter-catalog card counter-panel">
          <div className="counter-panel-head">
            <h2 className="counter-panel-title">Find items</h2>
            <span className="small counter-kbd">F2</span>
          </div>
          <label className="counter-search">
            <Search size={20} aria-hidden="true" />
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
              placeholder="Scan barcode or type name / SKU"
              aria-label="Search items or scan SKU or barcode"
              autoFocus
            />
          </label>
          {!items.length ? (
            <div className="counter-empty-stage">
              <p className="counter-empty-title">No products yet</p>
              <p className="small">
                {canAddItems ? (
                  <>
                    <button type="button" className="link-button" onClick={() => openCreateItem()}>Add item</button>
                    {" "}or import CSV under Inventory.
                  </>
                ) : (
                  <>Ask an accountant to add products under Inventory.</>
                )}
                {onOpenInventory ? (
                  <>
                    {" "}
                    <button type="button" className="link-button" onClick={onOpenInventory}>Open Inventory</button>
                  </>
                ) : null}
              </p>
            </div>
          ) : !String(query || "").trim() ? (
            <div className="counter-empty-stage">
              <Search size={28} aria-hidden="true" className="counter-empty-icon" />
              <p className="counter-empty-title">Scan or search to start</p>
              <p className="small">Barcode, SKU, brand, or name — Enter adds. Hold F4 · Charge F9.</p>
            </div>
          ) : (
            <ul className="counter-item-list">
              {catalog.map(item => {
                const stock = Number(stockByItem[item.id] ?? 0);
                const low = item.itemType !== "service" && stock <= 0;
                return (
                  <li key={item.id} className={`counter-item${low ? " is-low" : ""}`}>
                    <div className="counter-item-copy">
                      <span className="counter-item-name">{item.name}</span>
                      <span className="small">
                        {[
                          item.brand,
                          item.sku || "No SKU",
                          item.batchNo ? `Batch ${item.batchNo}` : "",
                          itemExpiryStatus(item.expiryDate, { today }).label,
                          item.itemType !== "service" ? `Stock ${stock}` : "",
                        ].filter(Boolean).join(" · ")}
                      </span>
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
              {!catalog.length ? (
                <li className="small">
                  No matching items.
                  {canAddItems ? (
                    <>
                      {" "}
                      <button type="button" className="link-button" onClick={() => openCreateItem({ sku: query, barcode: query })}>Add “{String(query || "").trim() || "item"}”</button>
                    </>
                  ) : (
                    <> Try another name, SKU, or barcode.</>
                  )}
                </li>
              ) : null}
            </ul>
          )}
        </section>

        <section className="counter-cart card counter-panel">
          <div className="counter-panel-head">
            <h2 className="counter-panel-title"><ShoppingCart size={18} aria-hidden="true" /> Bill{lines.length ? ` · ${lines.length}` : ""}</h2>
            <button type="button" className="btn" disabled={!lines.length || busy} onClick={clearBill}>Clear</button>
          </div>
          {!lines.length ? (
            <div className="counter-empty-stage is-compact">
              <p className="counter-empty-title">Bill is empty</p>
              <p className="small">Search or scan on the left to add lines.</p>
            </div>
          ) : (
            <ul className="counter-line-list">
              {lines.map((line, index) => (
                <li key={`${line.itemId}-${index}`} className="counter-line">
                  <div className="counter-line-main">
                    <strong>{line.itemName}</strong>
                    <span className="small">
                      {[
                        line.itemSku,
                        line._batchNo ? `Batch ${line._batchNo}` : "",
                        line._rateList ? line._rateList : line._rateSource === "party_list" ? "Party price" : "",
                        line._stock != null ? `Stock ${line._stock}` : "",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <input
                    className="counter-qty"
                    inputMode="numeric"
                    aria-label={`Quantity for ${line.itemName}`}
                    value={line.quantity}
                    onChange={event => patchLine(index, { quantity: wholeQuantity(event.target.value) || "0" })}
                  />
                  <input
                    className="counter-line-rate-input"
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={`Rate for ${line.itemName}`}
                    value={line.rate}
                    onChange={event => patchLine(index, { rate: event.target.value })}
                  />
                  <strong className="counter-line-net">{money(lineNet(line))}</strong>
                  <button type="button" className="btn counter-line-remove" aria-label={`Remove ${line.itemName}`} onClick={() => removeLine(index)}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="counter-pay card counter-panel">
          <div className="counter-panel-head">
            <h2 className="counter-panel-title">Checkout</h2>
            <span className="small counter-kbd">F9</span>
          </div>
          <FieldBlock label="Customer">
            <p className="counter-walkin" aria-label="Customer">Cash (walk-in)</p>
            <p className="small">Walk-in only. Named credit parties stay in Accounts sales.</p>
          </FieldBlock>
          <FieldBlock label="Payment">
            <Select
              aria-label="Payment mode"
              className="counter-pay-select"
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
            <div className="counter-total-due"><span>Total due</span><strong>{money(totals.total)}</strong></div>
          </div>

          <div className="counter-pay-actions">
            <button type="button" className="btn counter-hold-btn" disabled={!lines.length || busy || Boolean(closed)} onClick={holdBill}>
              <Pause size={16} aria-hidden="true" /> Hold
            </button>
            <button type="button" className="btn primary counter-charge" disabled={!lines.length || busy || saving || Boolean(closed)} onClick={charge}>
              {busy ? "Posting…" : `Charge ${money(totals.total)}`}
            </button>
          </div>
          <p className="small counter-pay-note">Record how they paid after UPI/card outside FinTrack — no gateway needed.</p>
        </section>
      </div>
      ) : null}

      {showItemForm && canAddItems ? (
        <ItemFormDialog
          form={itemForm}
          setShowForm={setShowItemForm}
          error={itemFormError}
          setForm={setItemForm}
          categories={itemCategories}
          saving={saving}
          saveItem={saveCounterItem}
        />
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
