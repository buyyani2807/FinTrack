import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2, Pause, Play, Plus, ShoppingCart, RotateCcw, Landmark, ScrollText, Star } from "lucide-react";
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
import {
  emptyItemLine,
  itemizedEntryDraft,
  itemPackMeta,
  parseItemQuantity,
  quantityInBaseUnit,
  sellUnitChoices,
} from "../model/inventoryModel.js";
import { resolveItemRate } from "../model/priceLists.js";
import { cancelVoucher, postVoucher, upsertCounterDayClose } from "../data/accountingRepository.js";
import {
  listOfflineBills,
  loadCounterCatalogCache,
  putOfflineBill,
  saveCounterCatalogCache,
} from "../data/counterOfflineStore.js";
import {
  itemExpiryStatus,
  readCounterSession,
  readDayClose,
  saveCounterSession,
  saveDayClose,
} from "../model/counterSettings.js";
import { readCounterHolds, saveCounterHolds } from "../model/counterHolds.js";
import {
  applyBillDiscountToLines,
  counterEstimateTotal,
  counterLineNet,
  fefoLotsForItem,
} from "../model/counterBillMath.js";
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
import {
  buildOfflineReceiptInvoice,
  isBrowserOnline,
  isLikelyNetworkError,
  nextOfflineReference,
  offlineChargeBlocked,
  pendingOfflineBills,
} from "../model/counterOffline.js";
import { syncOfflineCounterBills } from "../model/counterOfflineSync.js";
import { printSalesInvoicePdf } from "../io/salesInvoicePdf.js";
import { formatReceiptDateTime } from "../../receipts/model/receiptModel.js";
import { accountsCompanyBranding } from "../model/salesInvoiceModel.js";
import { isValidUpiId, upiPayLink } from "../model/upiPay.js";
import { creditCheck } from "../model/tradeDocumentModel.js";
import { QrSvg } from "../PayPage.jsx";
import { AccShortcutsPanel } from "./AccShortcutsPanel.jsx";

const PAY_MODES = COUNTER_PAY_MODES;
const lineNet = counterLineNet;
const estimateTotal = counterEstimateTotal;

/** Prefer pack size typed on the bill line; else take it from the item master. */
function withCatalogPack(line, items = []) {
  if (itemPackMeta(line)) return line;
  const item = (items || []).find(row => row.id === line.itemId);
  if (!itemPackMeta(item)) return line;
  return {
    ...line,
    packContainsQty: item.packContainsQty,
    packContainsUnit: item.packContainsUnit || "",
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
  return {
    id: newClientRequestId(),
    label: "",
    lines: [],
    partyId: CASH_PARTY_ID,
    moneyMode: "cash",
    settlement: "paid",
    billDiscount: "",
    tillMode: "sale",
    receivedCash: "",
    receivedUpi: "",
  };
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
  saving = false,
  accounts = [],
  items = [],
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
  onRefresh = null,
  askReason = null,
  documentSettings = null,
  voucherItemLines = [],
  workspace = null,
}) {
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState([]);
  const [partyId, setPartyId] = useState(CASH_PARTY_ID);
  const [moneyMode, setMoneyMode] = useState("cash");
  const [settlement, setSettlement] = useState("paid");
  const [tillMode, setTillMode] = useState("sale"); // sale | return
  const [billDiscount, setBillDiscount] = useState("");
  const [lotPicker, setLotPicker] = useState(null);
  const [printNotice, setPrintNotice] = useState("");
  const [receivedCash, setReceivedCash] = useState("");
  const [receivedUpi, setReceivedUpi] = useState("");
  const [holds, setHolds] = useState([]);
  const [holdsReady, setHoldsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastBill, setLastBill] = useState(null);
  const [panel, setPanel] = useState("bill"); // bill | close | report
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [cashierName, setCashierName] = useState("");
  const [reportDate, setReportDate] = useState(() => todayIso());
  const [reportTillScope, setReportTillScope] = useState("active"); // active | all
  const [online, setOnline] = useState(() => isBrowserOnline());
  const [offlineBills, setOfflineBills] = useState([]);
  const [offlineSyncing, setOfflineSyncing] = useState(false);
  const [offlineQueueOpen, setOfflineQueueOpen] = useState(false);
  const [cachedCatalog, setCachedCatalog] = useState(null);
  const today = todayIso();
  const companyId = activeCompany?.id || null;
  const tills = counterSettings?.tills?.length ? counterSettings.tills : [{ id: "till-1", label: counterSettings?.tillLabel || "Till 1" }];
  const activeTillId = tills.some(till => till.id === counterSettings?.activeTillId) ? counterSettings.activeTillId : tills[0].id;
  const tillLabel = tills.find(till => till.id === activeTillId)?.label || "Till 1";
  const closed = companyId ? readDayClose(companyId, today, activeTillId) : null;
  const workingItems = items?.length ? items : (cachedCatalog?.items || []);
  const workingAccounts = accounts?.length ? accounts : (cachedCatalog?.accounts || []);
  const workingPriceLists = priceLists?.length ? priceLists : (cachedCatalog?.priceLists || []);
  const pendingOffline = useMemo(() => pendingOfflineBills(offlineBills), [offlineBills]);
  const offlineBlock = useMemo(() => offlineChargeBlocked(offlineBills), [offlineBills]);
  const pendingOfflineTotal = useMemo(
    () => roundMoney(pendingOffline.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)),
    [pendingOffline],
  );
  const pendingOfflinePreview = useMemo(
    () => pendingOffline.slice(-8).reverse(),
    [pendingOffline],
  );

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
      return counterDayReportAll(workingAccounts, vouchers, { date, tills });
    }
    return counterDayReport(workingAccounts, vouchers, { date, tillLabel });
  }, [workingAccounts, vouchers, reportDate, today, tillLabel, reportTillScope, tills]);
  const todayCloseReport = useMemo(
    () => counterDayReport(workingAccounts, vouchers, { date: today, tillLabel }),
    [workingAccounts, vouchers, today, tillLabel],
  );
  const catalog = useMemo(() => matchItems(workingItems, query), [workingItems, query]);
  const gstEnabled = (activeCompany || cachedCatalog?.company)?.gstRegistration === "regular";
  const billingPartyId = partyId || CASH_PARTY_ID;
  // Named parties only for khata / credit — paid Counter stays walk-in.
  const customers = useMemo(
    () => (parties || []).filter(party => (
      party.partyType === "customer"
      && party.isActive !== false
      && !/^suspense(\s+account)?$/i.test(String(party.name || "").trim())
    )),
    [parties],
  );
  const selectedParty = billingPartyId === CASH_PARTY_ID
    ? null
    : (customers.find(party => party.id === billingPartyId) || null);
  const favouriteIds = counterSettings?.favouriteItemIds || [];
  const favouriteItems = useMemo(
    () => favouriteIds
      .map(id => (workingItems || []).find(item => item.id === id && item.isActive !== false))
      .filter(Boolean)
      .slice(0, 24),
    [favouriteIds, workingItems],
  );
  const branding = useMemo(
    () => accountsCompanyBranding(activeCompany || cachedCatalog?.company, workspace),
    [activeCompany, cachedCatalog, workspace],
  );

  useEffect(() => {
    if (!companyId) {
      setCashierName("");
      return;
    }
    setCashierName(readCounterSession(companyId).cashierName || "");
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setHolds([]);
      setHoldsReady(true);
      return;
    }
    setHolds(readCounterHolds(companyId, activeTillId));
    setHoldsReady(true);
  }, [companyId, activeTillId]);

  useEffect(() => {
    if (!companyId || !holdsReady) return;
    saveCounterHolds(companyId, activeTillId, holds);
  }, [companyId, activeTillId, holds, holdsReady]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => {
      setOnline(false);
      setMoneyMode(current => (current === "bank" ? "cash" : current));
      if (panel === "close") setPanel("bill");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [panel]);

  useEffect(() => {
    if (!companyId) {
      setOfflineBills([]);
      setCachedCatalog(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [bills, cache] = await Promise.all([
          listOfflineBills(companyId),
          loadCounterCatalogCache(companyId),
        ]);
        if (cancelled) return;
        setOfflineBills(bills);
        if (cache) setCachedCatalog(cache);
      } catch {
        if (!cancelled) setOfflineBills([]);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !items?.length || !accounts?.length) return;
    saveCounterCatalogCache(companyId, {
      items,
      accounts,
      priceLists,
      company: activeCompany,
      counterSettings,
    }).catch(() => {});
  }, [companyId, items, accounts, priceLists, activeCompany, counterSettings]);

  // When the customer changes, refresh list rates unless the cashier typed a custom rate.
  useEffect(() => {
    setLines(current => {
      if (!current.length) return current;
      let changed = false;
      const next = current.map(line => {
        if (line.rateTouched || !line.itemId) return line;
        const item = (workingItems || []).find(row => row.id === line.itemId);
        if (!item) return line;
        const resolved = resolveItemRate({ item, party: selectedParty, lists: workingPriceLists, kind: "selling" });
        const rate = String(resolved?.rate ?? item.sellingPrice ?? "");
        if (rate === String(line.rate ?? "") && line._rateSource === resolved.source) return line;
        changed = true;
        return { ...line, rate, _rateSource: resolved.source, _rateList: resolved.listName || "" };
      });
      return changed ? next : current;
    });
  }, [billingPartyId, selectedParty, workingPriceLists, workingItems]);

  // Pull bag/pack size from the item master onto open bill lines (e.g. after editing Rice).
  useEffect(() => {
    setLines(current => {
      if (!current.length || !(workingItems || []).length) return current;
      let changed = false;
      const next = current.map(line => {
        if (!line.itemId || itemPackMeta(line)) return line;
        const item = workingItems.find(row => row.id === line.itemId);
        if (!itemPackMeta(item)) return line;
        changed = true;
        return {
          ...line,
          packContainsQty: item.packContainsQty,
          packContainsUnit: item.packContainsUnit || "",
        };
      });
      return changed ? next : current;
    });
  }, [workingItems]);
  const partyState = billingPartyId === CASH_PARTY_ID
    ? ((activeCompany || cachedCatalog?.company)?.stateCode || "")
    : (selectedParty?.stateCode || gstStateFromGstin(selectedParty?.gstin));
  const intra = isIntraGst((activeCompany || cachedCatalog?.company)?.stateCode, partyState);
  const billLines = useMemo(
    () => (lines || []).map(line => withCatalogPack(line, workingItems)),
    [lines, workingItems],
  );
  const chargeLines = useMemo(
    () => applyBillDiscountToLines(billLines, billDiscount),
    [billLines, billDiscount],
  );
  const totals = useMemo(
    () => estimateTotal(chargeLines, { gstEnabled, intra }),
    [chargeLines, gstEnabled, intra],
  );
  const upiLink = useMemo(() => {
    if (tillMode === "return") return "";
    if (settlement !== "paid" || (moneyMode !== "upi" && moneyMode !== "cash_upi")) return "";
    if (!isValidUpiId(branding?.upiId) || branding?.showUpiQr === false) return "";
    if (!(totals.total > 0)) return "";
    return upiPayLink({
      upiId: branding.upiId,
      payeeName: branding.upiPayeeName || branding.companyName || "",
      amount: totals.total,
      note: `Counter ${tillLabel}`,
    });
  }, [tillMode, settlement, moneyMode, branding, totals.total, tillLabel]);
  const creditAdvice = useMemo(() => {
    if (settlement !== "credit" || !selectedParty) return null;
    return creditCheck({
      party: selectedParty,
      outstanding: 0,
      invoiceTotal: totals.total,
      overdueDays: 0,
      settings: documentSettings || {},
    });
  }, [settlement, selectedParty, totals.total, documentSettings]);
  const expectedCash = useMemo(() => {
    // Drawer cash = opening float + cash portion of Counter tenders (not full Cash+UPI bills).
    const cashSales = todayCloseReport.tender.cash;
    return roundMoney(Number(openingFloat || closed?.openingFloat || 0) + cashSales);
  }, [todayCloseReport, openingFloat, closed]);
  const variance = roundMoney(Number(countedCash || 0) - expectedCash);
  const sessionTips = useMemo(
    () => counterSessionAdvisories({
      items: workingItems,
      stockByItem,
      stockMovements,
      lines: billLines,
      vouchers,
      tillLabel,
      today,
      cartTotal: totals.total,
    }),
    [workingItems, stockByItem, stockMovements, billLines, vouchers, tillLabel, today, totals.total],
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

  const pushItemLine = item => {
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
          const sellUnit = line.sellUnit || line.unit || "Nos";
          const nextQty = parseItemQuantity(String(Number(line.quantity || 0) + 1), sellUnit);
          return { ...line, quantity: nextQty || "1" };
        });
      }
      const resolved = resolveItemRate({ item, party: selectedParty, lists: workingPriceLists, kind: "selling" });
      const rate = resolved?.rate ?? item.sellingPrice ?? 0;
      const unit = item.unit || "Nos";
      return [
        ...current,
        {
          ...emptyItemLine(),
          itemId: item.id,
          itemName: item.name,
          itemSku: item.sku || "",
          itemType: item.itemType || "product",
          unit,
          sellUnit: unit,
          packContainsQty: item.packContainsQty ?? null,
          packContainsUnit: item.packContainsUnit || "",
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
    setLotPicker(null);
    setQuery("");
    searchRef.current?.focus();
  };

  const addItem = (item, { skipLotPick = false } = {}) => {
    if (!item?.id || !canWrite) return;
    if (!skipLotPick) {
      const lots = fefoLotsForItem(item, workingItems, { today });
      if (lots.length > 1) {
        setLotPicker({ seed: item, lots });
        setQuery("");
        return;
      }
      if (lots.length === 1) {
        pushItemLine(lots[0]);
        return;
      }
    }
    pushItemLine(item);
  };

  const tryAddFromQuery = () => {
    const q = String(query || "").trim();
    if (!q) return;
    const exact = findItemByCode(workingItems, q);
    if (exact) {
      addItem(exact);
      return;
    }
    if (catalog.length === 1) {
      addItem(catalog[0]);
    }
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
    setSettlement("paid");
    setBillDiscount("");
    setReceivedCash("");
    setReceivedUpi("");
    setError("");
  };

  const toggleFavourite = itemId => {
    if (!onCounterSettingsChange || !itemId) return;
    const current = favouriteIds.includes(itemId)
      ? favouriteIds.filter(id => id !== itemId)
      : [...favouriteIds.filter(id => id !== itemId), itemId].slice(0, 48);
    onCounterSettingsChange({ ...counterSettings, favouriteItemIds: current });
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
      settlement,
      billDiscount,
      tillMode,
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
    setSettlement(hold.settlement || "paid");
    setBillDiscount(hold.billDiscount || "");
    setTillMode(hold.tillMode === "return" ? "return" : "sale");
    setReceivedCash(hold.receivedCash || "");
    setReceivedUpi(hold.receivedUpi || "");
    setHolds(current => current.filter(row => row.id !== holdId));
    setError("");
  };

  const refreshOfflineBills = async () => {
    if (!companyId) return [];
    const bills = await listOfflineBills(companyId);
    setOfflineBills(bills);
    return bills;
  };

  const buildTillBill = ({ draft, moneyParts, payMode, voucherId, total, isReturn, offlineRef }) => ({
    id: voucherId || newClientRequestId(),
    offlineRef: offlineRef || (voucherId ? `Till · ${String(voucherId).slice(0, 8)}` : "Counter"),
    date: today,
    createdAt: new Date().toISOString(),
    moneyMode: payMode,
    moneyParts,
    amount: total,
    syncStatus: voucherId ? "posted" : "pending",
    payload: {
      ...draft,
      narration: [
        draft?.narration || "",
        isReturn ? "Return" : "Counter sale",
      ].filter(Boolean).join(" · "),
    },
  });

  const printOfflineBill = bill => {
    const company = activeCompany || cachedCatalog?.company || {};
    const invoice = buildOfflineReceiptInvoice({
      bill,
      companyName: company.name || branding?.companyName || "FinTrack",
      companyAddress: company.documentSettings?.businessAddress || branding?.companyAddress || "",
      companyGstin: company.gstin || branding?.companyGstin || "",
      companyPhone: company.documentSettings?.businessPhone || branding?.companyPhone || "",
    });
    if (!invoice) {
      setPrintNotice("Could not build the receipt. Try Print again.");
      return false;
    }
    const ok = printSalesInvoicePdf(invoice, { template: "thermal" });
    setPrintNotice(ok
      ? "Receipt opened — choose your thermal printer in the print dialog."
      : "Allow pop-ups for FinTrack, then tap Print again.");
    window.setTimeout(() => setPrintNotice(""), 10000);
    return ok;
  };

  const queueOfflineSale = async ({
    draft,
    moneyParts,
    clientRequestId,
  }) => {
    if (!companyId) throw new Error("Choose a company before charging offline.");
    if (offlineBlock.blocked) throw new Error(offlineBlock.reason);
    const existing = await listOfflineBills(companyId);
    const offlineRef = nextOfflineReference(today, existing.map(row => row.offlineRef));
    const total = voucherTotals(draft.lines).debit;
    const bill = {
      id: clientRequestId,
      companyId,
      offlineRef,
      tillId: activeTillId,
      tillLabel,
      cashierName: cashierName || "",
      date: today,
      createdAt: new Date().toISOString(),
      moneyMode,
      moneyParts,
      amount: total,
      syncStatus: "pending",
      syncError: "",
      voucherId: null,
      payload: {
        ...draft,
        clientRequestId,
        sourceModule: "accounts",
        sourceType: "pos_counter",
      },
    };
    await putOfflineBill(bill);
    await refreshOfflineBills();
    setLastBill({
      voucherId: null,
      offlineId: bill.id,
      offlineRef,
      total,
      at: bill.createdAt,
      lines: lines.length,
      pendingSync: true,
      printBill: bill,
    });
    clearBill();
    setPrintNotice("Bill saved offline. Tap Print on the last bill for the receipt.");
    window.setTimeout(() => setPrintNotice(""), 10000);
    return bill;
  };

  const runOfflineSync = async () => {
    if (!token || !companyId || !online || offlineSyncing) return;
    setOfflineSyncing(true);
    try {
      const result = await syncOfflineCounterBills({ token, companyId });
      await refreshOfflineBills();
      if (result.synced?.length) onRefresh?.();
      if (result.failed?.length) {
        setError(result.failed[0]?.error || "Could not sync an offline bill.");
      }
    } catch (err) {
      setError(err?.message || "Could not sync offline bills.");
    } finally {
      setOfflineSyncing(false);
    }
  };

  useEffect(() => {
    if (!online || !token || !companyId || !pendingOffline.length) return undefined;
    const timer = window.setTimeout(() => { runOfflineSync(); }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when connectivity or queue changes
  }, [online, token, companyId, pendingOffline.length]);

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
    if (!workingAccounts.length) {
      setError("Catalog is not ready. Connect once online to cache the till, then retry.");
      return;
    }
    const isReturn = tillMode === "return";
    const useCredit = !isReturn && settlement === "credit";
    if (useCredit && billingPartyId === CASH_PARTY_ID) {
      setError("Choose a customer for khata / credit.");
      return;
    }
    if (useCredit && creditAdvice?.level === "block") {
      setError(creditAdvice.messages[0] || "Credit is blocked for this customer.");
      return;
    }
    if (isReturn && settlement === "credit" && billingPartyId === CASH_PARTY_ID) {
      setError("Choose the customer for a credit return, or refund as cash/UPI.");
      return;
    }
    if (offlineBlock.blocked && (!online || pendingOffline.length)) {
      setError(offlineBlock.reason);
      return;
    }
    if (!online && (useCredit || moneyMode === "bank" || isReturn)) {
      setError(isReturn
        ? "Returns need the network."
        : useCredit
          ? "Khata / credit needs the network."
          : "Card needs the network. Use cash or UPI offline.");
      return;
    }
    const payMode = useCredit ? "cash" : moneyMode;
    const moneyParts = !useCredit && payMode === "cash_upi"
      ? { cash: Number(receivedCash || 0), upi: Number(receivedUpi || 0) }
      : null;
    const clientRequestId = newClientRequestId();
    setBusy(true);
    try {
      const draft = itemizedEntryDraft({
        kind: isReturn ? "credit_note" : "sale",
        accounts: workingAccounts,
        date: today,
        partyId: entryPartyId(billingPartyId),
        moneyMode: payMode,
        moneyParts,
        settlement: useCredit || (isReturn && settlement === "credit") ? "credit" : "paid",
        narration: [
          isReturn ? `Counter return · ${tillLabel}` : `Counter sale · ${tillLabel}`,
          cashierName ? `Cashier ${cashierName}` : "",
          useCredit ? "Khata" : counterPayLabel(payMode),
          selectedParty?.name ? selectedParty.name : "",
        ].filter(Boolean).join(" · "),
        itemLines: chargeLines,
        intra,
        taxInclusive: false,
        gstEnabled,
      });
      if (!online) {
        await queueOfflineSale({ draft, moneyParts, clientRequestId });
        return;
      }
      try {
        const voucherId = await postVoucher(token, {
          ...draft,
          clientRequestId,
          sourceModule: "accounts",
          sourceType: "pos_counter",
        });
        const total = voucherTotals(draft.lines).debit;
        const printBill = buildTillBill({ draft, moneyParts, payMode, voucherId, total, isReturn });
        setLastBill({
          voucherId,
          total,
          at: new Date().toISOString(),
          lines: lines.length,
          isReturn,
          printBill,
        });
        clearBill();
        setPrintNotice("Bill posted. Tap Print for the receipt — also on Reports → Sales / Day Book.");
        window.setTimeout(() => setPrintNotice(""), 12000);
        try {
          await onPosted?.(voucherId);
        } catch {
          /* Post already succeeded — refresh can retry from Day Book. */
        }
      } catch (err) {
        if (isLikelyNetworkError(err) && !useCredit && !isReturn) {
          setOnline(false);
          await queueOfflineSale({ draft, moneyParts, clientRequestId });
          return;
        }
        throw err;
      }
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

  const saveClose = async () => {
    if (!canManage || !companyId) return;
    if (!String(countedCash).trim()) {
      setError("Enter counted cash in the drawer.");
      return;
    }
    if (variance !== 0 && !String(closeReason || "").trim()) {
      setError("Enter a reason when counted cash differs from expected.");
      return;
    }
    const payload = {
      tillId: activeTillId,
      tillLabel,
      cashierName: cashierName || "",
      openingFloat: Number(openingFloat || 0),
      expectedCash,
      countedCash: Number(countedCash || 0),
      variance,
      reason: closeReason || "",
      billCount: todayCloseReport.billCount || 0,
      reportJson: {
        tender: todayCloseReport.tender,
        billCount: todayCloseReport.billCount,
        salesTotal: todayCloseReport.tender?.total || 0,
      },
    };
    saveDayClose(companyId, today, payload, activeTillId);
    if (online && token) {
      try {
        await upsertCounterDayClose(token, { companyId, date: today, ...payload });
      } catch (err) {
        if (err?.code !== "MIGRATION_REQUIRED") {
          setError(err?.message || "Day close saved on this device; server sync failed.");
          return;
        }
      }
    }
    setPanel("report");
    setError("");
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
                <span className="small">
                  Last {money(lastBill.total)}
                  {lastBill.offlineRef ? ` · ${lastBill.offlineRef}` : ""}
                </span>
                {lastBill.printBill || lastBill.offlineId || lastBill.voucherId ? (
                  <button
                    type="button"
                    className="link-button counter-last-print"
                    onClick={() => {
                      if (lastBill.printBill) {
                        printOfflineBill(lastBill.printBill);
                        return;
                      }
                      if (lastBill.offlineId) {
                        const bill = offlineBills.find(row => row.id === lastBill.offlineId);
                        if (bill) printOfflineBill(bill);
                        return;
                      }
                      if (lastBill.voucherId && onReprint) onReprint(lastBill.voucherId);
                    }}
                  >
                    Print
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
        <div className="counter-head-actions">
          <button
            type="button"
            className={`btn${panel === "report" ? " primary" : ""}`}
            onClick={() => setPanel(current => (current === "report" ? "bill" : "report"))}
          >
            <ScrollText size={16} aria-hidden="true" /> {panel === "report" ? "Back to till" : "Day report"}
          </button>
          {canManage ? (
            <button
              type="button"
              className={`btn${panel === "close" ? " primary" : ""}`}
              disabled={!online}
              title={!online ? "Day close needs internet after offline bills sync" : undefined}
              onClick={() => setPanel(current => (current === "close" ? "bill" : "close"))}
            >
              <Landmark size={16} aria-hidden="true" /> {panel === "close" ? "Back to till" : "Day close"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="acc-form-error" role="alert">{error}</p> : null}
      {printNotice ? <p className="notice" role="status">{printNotice}</p> : null}
      {!online ? (
        <p className="notice counter-offline-banner" role="status">
          Offline · {pendingOffline.length} bill{pendingOffline.length === 1 ? "" : "s"} pending sync
          {offlineBlock.blocked ? ` · ${offlineBlock.reason}` : " · cash/UPI charges save on this device (up to 2 days)"}
        </p>
      ) : null}
      {online && pendingOffline.length ? (
        <p className="notice" role="status">
          {offlineSyncing ? "Syncing offline bills…" : `${pendingOffline.length} offline bill${pendingOffline.length === 1 ? "" : "s"} waiting to sync.`}
          {" "}
          <button type="button" className="link-button" disabled={offlineSyncing} onClick={() => runOfflineSync()}>
            Sync now
          </button>
        </p>
      ) : null}
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

      {panel === "bill" && pendingOffline.length ? (
        <section className="counter-offline-queue card" aria-label="Offline bills pending sync">
          <div className="counter-offline-queue-head">
            <div>
              <h2 className="acc-subsection-title">
                Offline queue · {pendingOffline.length} bill{pendingOffline.length === 1 ? "" : "s"} · {money(pendingOfflineTotal)}
              </h2>
              <p className="small">
                Kept on this device until sync. Day close after upload.
                {offlineBlock.blocked ? ` ${offlineBlock.reason}` : ""}
              </p>
            </div>
            <div className="counter-offline-queue-actions">
              {online ? (
                <button type="button" className="btn primary" disabled={offlineSyncing} onClick={() => runOfflineSync()}>
                  {offlineSyncing ? "Syncing…" : "Sync now"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn"
                onClick={() => setOfflineQueueOpen(open => !open)}
              >
                {offlineQueueOpen ? "Hide recent" : "Show recent"}
              </button>
            </div>
          </div>
          {offlineQueueOpen ? (
            <>
              <ul className="counter-offline-queue-list">
                {pendingOfflinePreview.map(bill => (
                  <li key={bill.id} className="counter-offline-queue-row">
                    <span>
                      <strong>{bill.offlineRef}</strong>
                      <span className="small">
                        {" · "}{money(bill.amount)}
                        {" · "}{counterPayLabel(bill.moneyMode)}
                        {" · "}{bill.syncStatus === "error" ? bill.syncError || "Sync error" : bill.syncStatus}
                      </span>
                    </span>
                    <button type="button" className="btn" onClick={() => printOfflineBill(bill)}>Print</button>
                  </li>
                ))}
              </ul>
              {pendingOffline.length > pendingOfflinePreview.length ? (
                <p className="small">
                  Showing latest {pendingOfflinePreview.length} of {pendingOffline.length}. Full queue stays on device until sync.
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {panel === "close" ? (
        <section className="counter-dayclose card">
          <h2 className="acc-subsection-title">Day close · {tillLabel}</h2>
          <p className="copy">
            Compare drawer cash to Counter cash sales for {today}. Shortage/overage is recorded on this device for the owner — it does not auto-post a journal yet.
            {pendingOffline.length ? " Sync offline bills before relying on these totals." : ""}
          </p>
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
            <div className="counter-panel-tools">
              <span className="small counter-kbd">F2</span>
              <AccShortcutsPanel variant="counter" />
            </div>
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
          {!workingItems.length ? (
            <div className="counter-empty-stage">
              <p className="counter-empty-title">No products yet</p>
              <p className="small">
                {online
                  ? "Add products under Inventory, then return to Counter to sell."
                  : "No cached catalog on this device. Connect once online to prepare offline billing."}
              </p>
            </div>
          ) : !String(query || "").trim() ? (
            <div className="counter-empty-stage">
              <Search size={28} aria-hidden="true" className="counter-empty-icon" />
              <p className="counter-empty-title">Scan or search to start</p>
              <p className="small">Barcode, SKU, brand, or name — Enter adds. Hold F4 · Charge F9.</p>
              {favouriteItems.length ? (
                <div className="counter-fav-grid" role="list">
                  {favouriteItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      role="listitem"
                      className="btn counter-fav-chip"
                      onClick={() => addItem(item)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small">Star items in search results to pin quick keys here.</p>
              )}
            </div>
          ) : (
            <ul className="counter-item-list">
              {catalog.map(item => {
                const stock = Number(stockByItem[item.id] ?? 0);
                const low = item.itemType !== "service" && stock <= 0;
                const fav = favouriteIds.includes(item.id);
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
                      className={`btn counter-fav-toggle${fav ? " is-on" : ""}`}
                      aria-label={fav ? `Unpin ${item.name}` : `Pin ${item.name}`}
                      onClick={() => toggleFavourite(item.id)}
                    >
                      <Star size={14} aria-hidden="true" />
                    </button>
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
                <li className="small">No matching items. Try another name, SKU, or barcode.</li>
              ) : null}
            </ul>
          )}
          {lotPicker?.lots?.length ? (
            <div className="counter-lot-picker" role="dialog" aria-label="Choose batch">
              <p className="small"><strong>Pick batch (FEFO)</strong> — earliest expiry first for {lotPicker.seed?.name}.</p>
              <ul className="counter-item-list">
                {lotPicker.lots.map(lot => (
                  <li key={lot.id} className="counter-item">
                    <div className="counter-item-copy">
                      <span className="counter-item-name">{lot.sku || lot.name}</span>
                      <span className="small">
                        {[
                          lot.batchNo ? `Batch ${lot.batchNo}` : "No batch",
                          lot.expiryDate ? `Exp ${lot.expiryDate}` : "",
                          `Stock ${Number(stockByItem[lot.id] ?? 0)}`,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <button type="button" className="btn primary" onClick={() => pushItemLine(lot)}>Use</button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn" onClick={() => setLotPicker(null)}>Cancel</button>
            </div>
          ) : null}
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
              {lines.map((line, index) => {
                // Pack→loose conversion stays off the till — use a separate loose SKU instead.
                const sellChoices = sellUnitChoices(line.unit);
                const sellUnit = line.sellUnit || line.unit || "Nos";
                const baseQty = quantityInBaseUnit(line.quantity, line.unit, sellUnit, line);
                return (
                  <li key={`${line.itemId}-${index}`} className="counter-line">
                    <div className="counter-line-main">
                      <strong>{line.itemName}</strong>
                      <span className="small">
                        {[
                          line.itemSku,
                          line._batchNo ? `Batch ${line._batchNo}` : "",
                          line._rateList ? line._rateList : line._rateSource === "party_list" ? "Party price" : "",
                          line._stock != null ? `Stock ${line._stock} ${line.unit || ""}` : "",
                          sellChoices && sellUnit !== line.unit && baseQty > 0 ? `= ${baseQty} ${line.unit}` : "",
                          `₹${line.rate || 0} / ${line.unit || "unit"}`,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <div className="counter-line-controls">
                      <div className="counter-qty-wrap">
                        <input
                          className="counter-qty"
                          inputMode="decimal"
                          placeholder={sellUnit === "Gram" || sellUnit === "Millilitre" ? "500" : "0.5"}
                          aria-label={`Quantity for ${line.itemName} in ${sellUnit}`}
                          value={line.quantity}
                          onChange={event => patchLine(index, {
                            quantity: parseItemQuantity(event.target.value, sellUnit),
                          })}
                        />
                        {sellChoices ? (
                          <select
                            className="counter-sell-unit"
                            aria-label={`Sell unit for ${line.itemName}`}
                            title={`Bill in alternate unit; price stays per ${line.unit || "unit"}`}
                            value={sellUnit}
                            onChange={event => {
                              const nextSell = event.target.value;
                              const asBase = quantityInBaseUnit(line.quantity, line.unit, sellUnit, line);
                              const nextAlt = sellChoices.find(row => row.id === nextSell);
                              const factor = nextAlt?.factorToBase || 1;
                              const converted = factor ? asBase / factor : asBase;
                              patchLine(index, {
                                sellUnit: nextSell,
                                quantity: parseItemQuantity(String(converted), nextSell) || "",
                              });
                            }}
                          >
                            {sellChoices.map(choice => (
                              <option key={choice.id} value={choice.id}>{choice.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="small counter-qty-unit">{line.unit || "Nos"}</span>
                        )}
                      </div>
                      <input
                        className="counter-line-rate-input"
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`Rate for ${line.itemName} per ${line.unit || "unit"}`}
                        value={line.rate}
                        onChange={event => patchLine(index, { rate: event.target.value, rateTouched: true })}
                      />
                      <strong className="counter-line-net">{money(lineNet(line))}</strong>
                    </div>
                    <button type="button" className="btn counter-line-remove" aria-label={`Remove ${line.itemName}`} onClick={() => removeLine(index)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="counter-pay card counter-panel">
          <div className="counter-panel-head">
            <h2 className="counter-panel-title">Checkout</h2>
            <span className="small counter-kbd">F9</span>
          </div>
          <div className="counter-mode-toggle" role="group" aria-label="Sale or return">
            <button type="button" className={`btn${tillMode === "sale" ? " primary" : ""}`} disabled={busy} onClick={() => setTillMode("sale")}>Sale</button>
            <button type="button" className={`btn${tillMode === "return" ? " primary" : ""}`} disabled={busy} onClick={() => { setTillMode("return"); setSettlement("paid"); setPartyId(CASH_PARTY_ID); }}>Return</button>
          </div>
          {tillMode === "sale" ? (
            <FieldBlock label="Settlement">
              <Select
                aria-label="Settlement"
                className="counter-pay-select"
                value={settlement}
                onChange={event => {
                  const next = event.target.value;
                  setSettlement(next);
                  if (next === "paid") setPartyId(CASH_PARTY_ID);
                }}
                disabled={busy}
              >
                <option value="paid">Paid now</option>
                <option value="credit">Khata / credit</option>
              </Select>
              {creditAdvice?.level === "warn" ? <p className="small">{creditAdvice.messages[0]}</p> : null}
            </FieldBlock>
          ) : (
            <FieldBlock label="Refund to">
              <Select
                aria-label="Refund settlement"
                className="counter-pay-select"
                value={settlement}
                onChange={event => {
                  const next = event.target.value;
                  setSettlement(next);
                  if (next === "paid") setPartyId(CASH_PARTY_ID);
                }}
                disabled={busy}
              >
                <option value="paid">Cash / UPI refund</option>
                <option value="credit">Credit note on khata</option>
              </Select>
            </FieldBlock>
          )}
          <FieldBlock label="Customer">
            {settlement === "credit" ? (
              <Select
                aria-label="Customer"
                className="counter-pay-select"
                value={billingPartyId === CASH_PARTY_ID ? "" : billingPartyId}
                onChange={event => {
                  const next = event.target.value;
                  if (!next) {
                    setPartyId(CASH_PARTY_ID);
                    return;
                  }
                  setPartyId(next);
                }}
                disabled={busy}
              >
                <option value="">Select customer</option>
                {customers.map(party => (
                  <option key={party.id} value={party.id}>{party.name}</option>
                ))}
              </Select>
            ) : (
              <>
                <p className="counter-walkin" aria-label="Customer">Cash (walk-in)</p>
                <p className="small">Walk-in only. Choose Khata / credit above for a named customer.</p>
              </>
            )}
          </FieldBlock>
          <FieldBlock label="Bill discount">
            <input
              inputMode="decimal"
              placeholder="₹ or % e.g. 50 or 5%"
              value={billDiscount}
              onChange={event => setBillDiscount(event.target.value)}
              disabled={busy || !lines.length}
              aria-label="Bill discount"
            />
          </FieldBlock>
          {settlement === "paid" ? (
            <>
              <FieldBlock label="Payment">
                <Select
                  aria-label="Payment mode"
                  className="counter-pay-select"
                  value={moneyMode}
                  onChange={event => setMoneyMode(event.target.value)}
                  disabled={busy}
                >
                  {PAY_MODES.filter(mode => online || mode.id !== "bank").map(mode => (
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
              {upiLink ? (
                <div className="counter-upi-qr">
                  <QrSvg text={upiLink} size={120} label="UPI QR for this bill" />
                  <p className="small">Scan to pay {money(totals.total)} via UPI</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="small">Khata bill — no tender. Collect later from Accounts.</p>
          )}

          <div className="counter-totals">
            <div><span>Taxable</span><strong>{money(totals.taxable)}</strong></div>
            {gstEnabled ? <div><span>{totals.taxLabel || "GST"}</span><strong>{money(totals.tax)}</strong></div> : null}
            <div className="counter-total-due"><span>{tillMode === "return" ? "Refund" : "Total due"}</span><strong>{money(totals.total)}</strong></div>
          </div>

          <div className="counter-pay-actions">
            <button type="button" className="btn counter-hold-btn" disabled={!lines.length || busy || Boolean(closed)} onClick={holdBill}>
              <Pause size={16} aria-hidden="true" /> Hold
            </button>
            <button
              type="button"
              className="btn primary counter-charge"
              disabled={!lines.length || busy || saving || Boolean(closed) || offlineBlock.blocked || !workingAccounts.length || creditAdvice?.level === "block"}
              onClick={charge}
            >
              {busy
                ? (online ? "Posting…" : "Saving offline…")
                : `${tillMode === "return" ? "Refund" : settlement === "credit" ? "Post khata" : online ? "Charge" : "Charge offline"} ${money(totals.total)}`}
            </button>
          </div>
          <p className="small counter-pay-note">
            {settlement === "credit"
              ? "Khata posts to the customer ledger."
              : "UPI/card confirmation is outside FinTrack unless you scan the QR above."}
          </p>
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
