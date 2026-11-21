import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2, Pause, Play, Plus, ShoppingCart, RotateCcw, Landmark, ScrollText, Star, History, Share2, MessageCircleQuestion, Maximize2, Minimize2, ScanBarcode, Banknote } from "lucide-react";
import { Select } from "../../../components/Select.jsx";
import { money } from "../accountsFormat.js";
import { formatIstTime, todayIso } from "../../../lib/dates.js";
import { rowInstant } from "../model/dateSort.js";
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
import { cancelVoucher, listCounterCashMovements, postVoucher, requestCounterOverride, upsertCounterDayClose } from "../data/accountingRepository.js";
import { SupervisorPinDialog } from "./SupervisorPinDialog.jsx";
import { CounterCameraScanner } from "./CounterCameraScanner.jsx";
import { CounterCashDialog } from "./CounterCashDialog.jsx";
import {
  cashMovementTotals,
  expectedDrawerCash,
  mapCashMovementRow,
  tillCashMovements,
} from "../model/counterCashMovements.js";
import { cameraScanSupported } from "../model/cameraScan.js";
import {
  listOfflineBills,
  loadCounterCatalogCache,
  putOfflineBill,
  saveCounterCatalogCache,
} from "../data/counterOfflineStore.js";
import {
  counterPrintFormatSpec,
  itemExpiryStatus,
  readCounterSession,
  readDayClose,
  saveCounterSession,
  saveDayClose,
} from "../model/counterSettings.js";
import { readCounterHolds, saveCounterHolds } from "../model/counterHolds.js";
import { clearCounterDraft, readCounterDraft, saveCounterDraft } from "../model/counterDraft.js";
import {
  applyBillDiscountToLines,
  billDiscountAmount,
  buildCounterWhatsAppReceipt,
  cashChangeDue,
  counterSplitStatus,
  counterEstimateTotal,
  counterLineNet,
  counterOversellLines,
  fefoLotsForItem,
} from "../model/counterBillMath.js";
import {
  COUNTER_PAY_MODES,
  counterDayReport,
  counterDayReportAll,
  counterPayLabel,
  counterTenderLabel,
  tillNeedle,
} from "../model/counterDayReport.js";
import {
  counterBrowseItems,
  counterDayCloseBrief,
  counterDayCloseCoach,
  counterDayTopItems,
  counterKhataRisk,
  counterSaleCounts,
  counterSessionAdvisories,
} from "../model/counterAi.js";
import { askCounter, COUNTER_ASK_PROMPTS } from "../model/counterAsk.js";
import {
  findCounterItemByCode,
  matchCounterItems,
} from "../model/counterSearch.js";
import {
  buildOfflineReceiptInvoice,
  isBrowserOnline,
  isLikelyNetworkError,
  nextOfflineReference,
  offlineChargeBlocked,
  pendingOfflineBills,
} from "../model/counterOffline.js";
import { syncOfflineCounterBills } from "../model/counterOfflineSync.js";
import { invoicePdfShareOnThisDevice, printSalesInvoicePdf, salesInvoicePdfFile } from "../io/salesInvoicePdf.js";
import { formatReceiptDateTime } from "../../receipts/model/receiptModel.js";
import { canWhatsAppShare, openManualWhatsAppShare } from "../../receipts/io/receiptWhatsApp.js";
import { uploadReceiptPdfLink, withReceiptLink } from "../io/receiptLink.js";
import { accountsCompanyBranding } from "../model/salesInvoiceModel.js";
import { isValidUpiId, upiPayLink } from "../model/upiPay.js";
import { QrSvg } from "../PayPage.jsx";
import { AccShortcutsPanel } from "./AccShortcutsPanel.jsx";
import { counterReturnError, counterReturnLimits } from "../model/counterReturns.js";

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
    receivedCard: "",
    tenderedCash: "",
    paymentRef: "",
  };
}

function billTotal(voucher) {
  return voucherTotals(voucher.lines || []).debit;
}

/**
 * Retail Counter (POS) — Phase 2: holds, history/void, day-close, shortcuts.
 * Charge posts into the same Accounts sale vouchers + stock.
 */
const TILL_FULL_KEY = "ft.counter.tillFull";

/** Per-unit price text for the item finder, e.g. "/ Bag". Services have no stock unit. */
const itemUnitLabel = item => (item.itemType === "service" ? "" : item.unit || "Nos");

export function CounterWorkspace({
  token,
  canWrite = false,
  canManage = false,
  needsSupervisor = false,
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
  onWhatsAppShare = null,
  onRefresh = null,
  askReason = null,
  documentSettings = null,
  voucherItemLines = [],
  workspace = null,
}) {
  const searchRef = useRef(null);
  const [pinPrompt, setPinPrompt] = useState(null);
  // Cashier voids and returns need a supervisor PIN (migration 144). Resolves with the PIN or null.
  const askSupervisorPin = (title, note) => new Promise(resolve => setPinPrompt({ title, note, resolve }));
  const approveWithSupervisor = async ({ action, voucherId = null, reason = null, title, note }) => {
    const pin = await askSupervisorPin(title, note);
    if (pin == null) return false;
    await requestCounterOverride(token, { pin, action, voucherId, reason });
    return true;
  };
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState([]);
  const [partyId, setPartyId] = useState(CASH_PARTY_ID);
  const [moneyMode, setMoneyMode] = useState("cash");
  const [settlement, setSettlement] = useState("paid");
  const [tillMode, setTillMode] = useState("sale"); // sale | return
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [billDiscount, setBillDiscount] = useState("");
  // Round-off at the till: round the bill to the nearest rupee and post the paisa to Round off.
  const [roundOff, setRoundOff] = useState(false);
  const [lotPicker, setLotPicker] = useState(null);
  const [printNotice, setPrintNotice] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [askQuery, setAskQuery] = useState("");
  const [askAnswer, setAskAnswer] = useState(null);
  const [receivedCash, setReceivedCash] = useState("");
  const [receivedUpi, setReceivedUpi] = useState("");
  const [receivedCard, setReceivedCard] = useState("");
  const [tenderedCash, setTenderedCash] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  // Cash in / out for today (migration 148). A cashier's list holds only their own entries.
  const [cashOpen, setCashOpen] = useState(false);
  const [cashMovements, setCashMovements] = useState([]);
  const [cashUnavailable, setCashUnavailable] = useState("");
  const [holds, setHolds] = useState([]);
  const [holdsReady, setHoldsReady] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastBill, setLastBill] = useState(null);
  const [panel, setPanel] = useState("bill"); // bill | today | close | report
  // Full-screen till: hides the sidebar and Accounts header on this device. Laptop and desktop only (CSS).
  const [tillFull, setTillFull] = useState(() => {
    try { return window.localStorage.getItem(TILL_FULL_KEY) === "1"; } catch { return false; }
  });
  const toggleTillFull = () => setTillFull(current => {
    const next = !current;
    try { window.localStorage.setItem(TILL_FULL_KEY, next ? "1" : "0"); } catch { /* private mode */ }
    return next;
  });
  useEffect(() => {
    if (!tillFull || !canWrite) return undefined;
    const root = document.documentElement;
    root.classList.add("counter-till-full");
    return () => root.classList.remove("counter-till-full");
  }, [tillFull, canWrite]);
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
  const catalog = useMemo(() => matchCounterItems(workingItems, query), [workingItems, query]);
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
      setDraftReady(false);
      return;
    }
    // Pause autosave while swapping company/till so we never write the old cart onto the new key.
    setDraftReady(false);
    setHoldsReady(false);
    setHolds(readCounterHolds(companyId, activeTillId));
    setHoldsReady(true);
    const draft = readCounterDraft(companyId, activeTillId);
    if (draft) {
      setLines(draft.lines);
      setPartyId(draft.partyId || CASH_PARTY_ID);
      setMoneyMode(draft.moneyMode || "cash");
      setSettlement(draft.settlement || "paid");
      setBillDiscount(draft.billDiscount || "");
      setRoundOff(Boolean(draft.roundOff));
      setTillMode(draft.tillMode === "return" ? "return" : "sale");
      setReceivedCash(draft.receivedCash || "");
      setReceivedUpi(draft.receivedUpi || "");
      setReceivedCard(draft.receivedCard || "");
      setTenderedCash(draft.tenderedCash || "");
      setPaymentRef(draft.paymentRef || "");
      setWalkInName(draft.walkInName || "");
      setWalkInPhone(draft.walkInPhone || "");
    } else {
      setLines([]);
      setPartyId(CASH_PARTY_ID);
      setMoneyMode("cash");
      setSettlement("paid");
      setBillDiscount("");
      setTillMode("sale");
      setReceivedCash("");
      setReceivedUpi("");
      setTenderedCash("");
      setPaymentRef("");
      setWalkInName("");
      setWalkInPhone("");
    }
    setCategoryFilter("");
    setDraftReady(true);
  }, [companyId, activeTillId]);

  useEffect(() => {
    if (!companyId || !holdsReady) return;
    saveCounterHolds(companyId, activeTillId, holds);
  }, [companyId, activeTillId, holds, holdsReady]);

  const draftStateRef = useRef(null);
  draftStateRef.current = {
    companyId,
    activeTillId,
    draftReady,
    lines,
    partyId: billingPartyId,
    moneyMode,
    settlement,
    tillMode,
    billDiscount,
    receivedCash,
    receivedUpi,
    receivedCard,
    tenderedCash,
    paymentRef,
    roundOff,
    walkInName,
    walkInPhone,
  };

  useEffect(() => {
    if (!companyId || !draftReady) return undefined;
    if (!lines.length) {
      clearCounterDraft(companyId, activeTillId);
      return undefined;
    }
    const persist = () => {
      const draft = draftStateRef.current;
      if (!draft?.companyId || !draft.draftReady || !draft.lines.length) return;
      saveCounterDraft(draft.companyId, draft.activeTillId, draft);
    };
    const id = window.setTimeout(persist, 250);
    return () => window.clearTimeout(id);
  }, [
    companyId,
    activeTillId,
    draftReady,
    lines,
    billingPartyId,
    moneyMode,
    settlement,
    tillMode,
    billDiscount,
    receivedCash,
    receivedUpi,
    receivedCard,
    tenderedCash,
    paymentRef,
    roundOff,
    walkInName,
    walkInPhone,
  ]);

  useEffect(() => () => {
    const draft = draftStateRef.current;
    if (!draft?.companyId || !draft.draftReady) return;
    if (!draft.lines.length) clearCounterDraft(draft.companyId, draft.activeTillId);
    else saveCounterDraft(draft.companyId, draft.activeTillId, draft);
  }, []);

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
  const discountOff = useMemo(
    () => billDiscountAmount(billLines, billDiscount),
    [billLines, billDiscount],
  );
  // Round-off (sale only, not returns): round the bill to the nearest rupee.
  const roundOffActive = roundOff && totals.total > 0;
  const roundedTotal = roundOffActive ? Math.round(totals.total) : totals.total;
  const roundOffDiff = roundOffActive ? roundMoney(roundedTotal - totals.total) : 0;
  // Everything downstream from the total (Charge amount, UPI QR, cash tendered, split status) uses this.
  const chargeTotal = roundedTotal;
  const upiLink = useMemo(() => {
    if (tillMode === "return") return "";
    if (settlement !== "paid" || (moneyMode !== "upi" && moneyMode !== "cash_upi" && moneyMode !== "split")) return "";
    if (!isValidUpiId(branding?.upiId) || branding?.showUpiQr === false) return "";
    if (!(chargeTotal > 0)) return "";
    // A split bill shows the QR for its UPI part only, once that part is typed.
    const upiPart = Number(receivedUpi);
    if (moneyMode === "split" && !(upiPart > 0)) return "";
    return upiPayLink({
      upiId: branding.upiId,
      payeeName: branding.upiPayeeName || branding.companyName || "",
      amount: moneyMode === "split" ? upiPart : chargeTotal,
      note: `Counter ${tillLabel}`,
    });
  }, [tillMode, settlement, moneyMode, branding, chargeTotal, tillLabel, receivedUpi]);
  const khataRisk = useMemo(() => {
    if (settlement !== "credit" || !selectedParty) return null;
    return counterKhataRisk({
      accounts: workingAccounts,
      vouchers,
      parties,
      party: selectedParty,
      invoiceTotal: totals.total,
      today,
      settings: documentSettings || {},
    });
  }, [settlement, selectedParty, workingAccounts, vouchers, parties, totals.total, today, documentSettings]);
  const creditAdvice = khataRisk?.advice || null;
  const changeDue = useMemo(() => {
    if (tillMode === "return" || settlement !== "paid" || moneyMode !== "cash") return null;
    return cashChangeDue(tenderedCash, chargeTotal);
  }, [tillMode, settlement, moneyMode, tenderedCash, chargeTotal]);
  // Paid cash sales need tendered ≥ total before Charge (returns / khata / UPI-card skip this).
  const cashTenderMissing = tillMode !== "return"
    && settlement === "paid"
    && moneyMode === "cash"
    && (changeDue == null || changeDue < 0);
  // Split payment (sale only): cash, UPI and card parts must add up to the bill.
  const splitActive = tillMode !== "return" && settlement === "paid" && moneyMode === "split";
  const splitStatus = useMemo(
    () => counterSplitStatus(chargeTotal, { cash: receivedCash, upi: receivedUpi, card: receivedCard }),
    [chargeTotal, receivedCash, receivedUpi, receivedCard],
  );
  const splitInvalid = splitActive && !splitStatus.ok;
  const oversellLines = useMemo(
    () => (tillMode === "return" ? [] : counterOversellLines(chargeLines, stockByItem, workingItems)),
    [tillMode, chargeLines, stockByItem, workingItems],
  );
  const blockOversell = counterSettings?.blockOversell !== false;
  const categoryNameById = useMemo(
    () => Object.fromEntries((itemCategories || []).map(row => [row.id, row.name])),
    [itemCategories],
  );
  const categoryChips = useMemo(() => {
    const counts = new Map();
    for (const item of workingItems || []) {
      if (item.isActive === false) continue;
      const label = String(
        (item.categoryId && categoryNameById[item.categoryId])
        || item.brand
        || "",
      ).trim();
      if (!label) continue;
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 16)
      .map(([label]) => label);
  }, [workingItems, categoryNameById]);
  const categoryItems = useMemo(() => {
    if (!categoryFilter) return [];
    const needle = categoryFilter.toLowerCase();
    return (workingItems || [])
      .filter(item => {
        if (item.isActive === false) return false;
        const catName = String(
          (item.categoryId && categoryNameById[item.categoryId]) || "",
        ).trim().toLowerCase();
        const brand = String(item.brand || "").trim().toLowerCase();
        return catName === needle || brand === needle;
      })
      .slice(0, 40);
  }, [workingItems, categoryFilter, categoryNameById]);
  // With no search text the finder lists the chosen category, or the most sold items of the last 14 days.
  const saleCounts = useMemo(() => counterSaleCounts(stockMovements, { today }), [stockMovements, today]);
  const browseItems = useMemo(() => {
    if (categoryFilter) return categoryItems;
    return counterBrowseItems(workingItems, saleCounts);
  }, [categoryFilter, categoryItems, workingItems, saleCounts]);
  const browseHasBestSellers = !categoryFilter && browseItems.some(item => saleCounts[item.id] > 0);
  // Why Charge is off, in the same order the button checks.
  const chargeBlockReason = !lines.length || busy || saving
    ? ""
    : closed
      ? "Today’s till is closed."
      : offlineBlock.blocked
        ? offlineBlock.reason || "Sync the offline bills before charging again."
        : !workingAccounts.length
          ? "Catalog is not ready. Connect once online to cache the till."
          : creditAdvice?.level === "block"
            ? "This customer’s khata is blocked for new credit."
            : blockOversell && oversellLines.length > 0
              ? "Fix the short stock lines to charge."
              : cashTenderMissing
                ? `Enter cash tendered of ${money(chargeTotal)} or more to charge.`
                : splitInvalid
                  ? (splitStatus.remaining > 0
                    ? `${money(splitStatus.remaining)} still to collect across cash, UPI and card.`
                    : splitStatus.remaining < 0
                      ? `The payments are ${money(Math.abs(splitStatus.remaining))} more than the bill.`
                      : "Enter at least two payment amounts for a split payment.")
                  : "";
  const loadCashMovements = async () => {
    if (!token || !companyId || !isBrowserOnline()) return;
    try {
      const rows = await listCounterCashMovements(token, { from: today, to: today });
      setCashMovements((rows || []).map(mapCashMovementRow));
      setCashUnavailable("");
    } catch (err) {
      setCashMovements([]);
      setCashUnavailable(err?.code === "MIGRATION_REQUIRED" ? err.message : "");
    }
  };
  const loadCashMovementsRef = useRef(loadCashMovements);
  useEffect(() => {
    loadCashMovementsRef.current = loadCashMovements;
  });
  useEffect(() => {
    loadCashMovementsRef.current();
  }, [token, companyId, today, online]);
  const tillCash = useMemo(
    () => tillCashMovements(cashMovements, { date: today, tillId: activeTillId }),
    [cashMovements, today, activeTillId],
  );
  const cashTotals = useMemo(() => cashMovementTotals(tillCash), [tillCash]);
  const expectedCash = useMemo(() => {
    // Drawer cash = opening float + cash portion of Counter tenders (not full Cash+UPI bills)
    // + cash put into the till − cash taken out of it.
    // Cash refunds from Counter returns leave the drawer, so they come off the expectation.
    const cashSales = roundMoney(todayCloseReport.tender.cash - (todayCloseReport.refunds?.cash || 0));
    return expectedDrawerCash({
      openingFloat: Number(openingFloat || closed?.openingFloat || 0),
      cashSales,
      cashIn: cashTotals.cashIn,
      cashOut: cashTotals.cashOut,
    });
  }, [todayCloseReport, openingFloat, closed, cashTotals]);
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
      cashIn: cashTotals.cashIn,
      cashOut: cashTotals.cashOut,
      expectedCash,
      variance,
    }),
    [todayCloseReport, openingFloat, countedCash, cashTotals, expectedCash, variance, closed],
  );
  const dayCloseTopItems = useMemo(
    () => counterDayTopItems({ vouchers, voucherItemLines, today, tillLabel }),
    [vouchers, voucherItemLines, today, tillLabel],
  );
  const dayCloseBrief = useMemo(
    () => counterDayCloseBrief({
      companyName: branding?.companyName || activeCompany?.name || "",
      tillLabel,
      report: todayCloseReport,
      openingFloat: Number(openingFloat || closed?.openingFloat || 0),
      countedCash: Number(countedCash || 0),
      expectedCash,
      variance,
      reason: closeReason,
      topItems: dayCloseTopItems,
      cashierName,
    }),
    [
      branding,
      activeCompany,
      tillLabel,
      todayCloseReport,
      openingFloat,
      closed,
      countedCash,
      expectedCash,
      variance,
      closeReason,
      dayCloseTopItems,
      cashierName,
    ],
  );

  const runAskCounter = question => {
    const text = String(question || "").trim();
    setAskQuery(text);
    setAskAnswer(askCounter(text, {
      accounts: workingAccounts,
      vouchers,
      items: workingItems,
      parties,
      stockByItem,
      stockMovements,
      voucherItemLines,
      tillLabel,
      today,
      openingFloat: Number(openingFloat || closed?.openingFloat || 0),
      cashIn: cashTotals.cashIn,
      cashOut: cashTotals.cashOut,
    }));
  };

  const shareDayCloseBrief = async () => {
    // Owner ops brief — open WhatsApp with the text; nothing is sent until they tap send.
    if (!window.confirm("Open WhatsApp with this day-close brief? Nothing is sent until you tap send in WhatsApp.")) {
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(dayCloseBrief)}`, "_blank", "noopener,noreferrer");
  };

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
    const exact = findCounterItemByCode(workingItems, q);
    if (exact) {
      addItem(exact);
      return;
    }
    if (catalog.length === 1) {
      addItem(catalog[0]);
    }
  };

  // Camera scan: add the item with this barcode or SKU and say what happened.
  const addScannedCode = code => {
    const item = findCounterItemByCode(workingItems, code);
    if (!item) return `No item has the code ${code}.`;
    const lots = fefoLotsForItem(item, workingItems, { today });
    addItem(item);
    if (lots.length > 1) {
      setScanOpen(false);
      return "";
    }
    return `Added ${item.name}.`;
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
    setRoundOff(false);
    setReceivedCash("");
    setReceivedUpi("");
    setReceivedCard("");
    setTenderedCash("");
    setPaymentRef("");
    setWalkInName("");
    setWalkInPhone("");
    setError("");
  };

  const receiptCustomer = () => {
    if (selectedParty) {
      return {
        name: selectedParty.name || "",
        phone: selectedParty.phone || "",
      };
    }
    return {
      name: String(walkInName || "").trim(),
      phone: String(walkInPhone || "").trim(),
    };
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
      receivedCard,
      roundOff,
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
    setRoundOff(Boolean(hold.roundOff));
    setTillMode(hold.tillMode === "return" ? "return" : "sale");
    setReceivedCash(hold.receivedCash || "");
    setReceivedUpi(hold.receivedUpi || "");
    setReceivedCard(hold.receivedCard || "");
    setHolds(current => current.filter(row => row.id !== holdId));
    setError("");
  };

  const refreshOfflineBills = async () => {
    if (!companyId) return [];
    const bills = await listOfflineBills(companyId);
    setOfflineBills(bills);
    return bills;
  };

  const buildTillBill = ({ draft, moneyParts, payMode, voucherId, total, isReturn, offlineRef, customer }) => ({
    id: voucherId || newClientRequestId(),
    // Short bill ref from the voucher id — not the till register id (that is tillLabel / activeTillId).
    offlineRef: offlineRef || (voucherId
      ? `B-${String(voucherId).replace(/-/g, "").slice(0, 8).toUpperCase()}`
      : "Counter"),
    date: today,
    createdAt: new Date().toISOString(),
    moneyMode: payMode,
    moneyParts,
    amount: total,
    syncStatus: voucherId ? "posted" : "pending",
    tillLabel,
    cashierName: cashierName || "",
    customerName: customer?.name || "",
    customerPhone: customer?.phone || "",
    payload: {
      ...draft,
      customerName: customer?.name || "",
      customerPhone: customer?.phone || "",
      narration: [
        draft?.narration || "",
        isReturn ? "Return" : "Counter sale",
      ].filter(Boolean).join(" · "),
    },
  });

  // Shared with shareLastReceipt: the same receipt-shaped invoice object feeds
  // both the print PDF and the WhatsApp PDF attachment, so what prints matches
  // what's shared.
  const billToInvoice = bill => {
    const company = activeCompany || cachedCatalog?.company || {};
    const printFormat = counterSettings?.printFormat || "thermal80";
    return buildOfflineReceiptInvoice({
      bill,
      companyName: company.name || branding?.companyName || "MyFinTracker",
      companyAddress: company.documentSettings?.businessAddress || branding?.companyAddress || "",
      companyGstin: company.gstin || branding?.companyGstin || "",
      companyPhone: company.documentSettings?.businessPhone || branding?.companyPhone || "",
      printFormat,
    });
  };

  const billPhone = bill => bill?.customerPhone
    || selectedParty?.phone
    || (bill?.customerName ? (customers.find(party => party.name === bill.customerName)?.phone || "") : "");

  // Receipt PDF link for sending straight to the customer's number (see io/receiptLink.js).
  // Started as soon as a bill with a phone number is charged, so the link is usually
  // ready by the time the cashier taps Share and WhatsApp opens from that tap.
  const receiptLinkRef = useRef({ key: "", promise: null });
  const receiptLinkFor = bill => {
    const key = bill?.voucherId || bill?.offlineId || "";
    if (!key || !bill?.printBill || !token || !companyId || !isBrowserOnline()) return null;
    if (receiptLinkRef.current.key === key && receiptLinkRef.current.promise) return receiptLinkRef.current.promise;
    const invoice = billToInvoice(bill.printBill);
    const file = invoice ? salesInvoicePdfFile(invoice) : null;
    if (!file) return null;
    const promise = uploadReceiptPdfLink({ token, companyId, billKey: key, file }).catch(() => "");
    receiptLinkRef.current = { key, promise };
    return promise;
  };

  const rememberLastBill = bill => {
    setLastBill(bill);
    if (canWhatsAppShare(billPhone(bill))) receiptLinkFor(bill);
  };

  const printOfflineBill = bill => {
    const printFormat = counterSettings?.printFormat || "thermal80";
    const invoice = billToInvoice(bill);
    if (!invoice) {
      setPrintNotice("Could not build the receipt. Try Print again.");
      return false;
    }
    const ok = printSalesInvoicePdf(invoice);
    const formatSpec = counterPrintFormatSpec(printFormat);
    setPrintNotice(ok
      ? (formatSpec.kind === "regular"
        ? `Print dialog opened — pick your regular printer and ${formatSpec.label.split("· ")[1] || "paper"} (phone, Windows, or Mac).`
        : `Print dialog opened — pick your thermal printer and ~${formatSpec.widthMm} mm paper (phone, Windows, or Mac). Don’t choose Save as PDF for the shop printer.`)
      : "Could not open print. Tap Print again, or allow pop-ups if your browser asks.");
    window.setTimeout(() => setPrintNotice(""), 10000);
    return ok;
  };

  const canPrintLastBill = Boolean(
    lastBill && (lastBill.printBill || lastBill.offlineId || lastBill.voucherId),
  );

  const printLastBill = () => {
    if (!lastBill) return;
    if (lastBill.printBill) {
      printOfflineBill(lastBill.printBill);
      return;
    }
    if (lastBill.offlineId) {
      const bill = offlineBills.find(row => row.id === lastBill.offlineId);
      if (bill) printOfflineBill(bill);
      else setPrintNotice("Offline bill not found on this device. Open Today or Day report after sync.");
      return;
    }
    if (lastBill.voucherId && onReprint) {
      onReprint(lastBill.voucherId);
      setPrintNotice("Receipt opened — choose your printer in the print dialog.");
      window.setTimeout(() => setPrintNotice(""), 10000);
      return;
    }
    setPrintNotice("Print is not ready for this bill yet. Try Today → Print.");
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
      customerName: receiptCustomer().name,
      customerPhone: receiptCustomer().phone,
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
        customerName: receiptCustomer().name,
        customerPhone: receiptCustomer().phone,
      },
    };
    await putOfflineBill(bill);
    await refreshOfflineBills();
    rememberLastBill({
      voucherId: null,
      offlineId: bill.id,
      offlineRef,
      total,
      at: bill.createdAt,
      lines: lines.length,
      pendingSync: true,
      printBill: bill,
      receiptLines: chargeLines,
      receiptTotals: totals,
      payLabel: counterPayLabel(moneyMode),
      customerName: receiptCustomer().name,
      customerPhone: receiptCustomer().phone,
    });
    clearBill();
    setPrintNotice("Bill saved offline. Use Print receipt below for the thermal slip.");
    window.setTimeout(() => setPrintNotice(""), 20000);
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
    if (!isReturn && blockOversell && oversellLines.length) {
      const first = oversellLines[0];
      setError(
        `${first.name}: bill needs ${first.need}, stock is ${first.stock}. Reduce qty or turn off “Block Charge when stock is short” in Setup.`,
      );
      return;
    }
    if (!isReturn && !useCredit && moneyMode === "cash") {
      if (!String(tenderedCash).trim() || changeDue == null) {
        setError("Enter cash tendered before charging.");
        return;
      }
      if (changeDue < 0) {
        setError(`Cash tendered is short by ${money(Math.abs(changeDue))}.`);
        return;
      }
    }
    if (!isReturn && !useCredit && moneyMode === "split") {
      if (!online) {
        setError("Split payment needs the network. Use Cash + UPI offline.");
        return;
      }
      if (!splitStatus.ok) {
        setError(
          splitStatus.remaining > 0
            ? `${money(splitStatus.remaining)} is still to collect. The cash, UPI and card amounts must add up to ${money(chargeTotal)}.`
            : splitStatus.remaining < 0
              ? `The payments are ${money(Math.abs(splitStatus.remaining))} more than the bill.`
              : "Enter at least two payment amounts for a split payment.",
        );
        return;
      }
    }
    if (isReturn) {
      const returnProblem = counterReturnError(chargeLines, counterReturnLimits({ vouchers, voucherItemLines }));
      if (returnProblem) {
        setError(returnProblem);
        return;
      }
    }
    if (isReturn && needsSupervisor) {
      try {
        const approved = await approveWithSupervisor({
          action: "return",
          title: "Supervisor PIN for return",
          note: `Return of ${money(totals.total)}. A supervisor must enter the PIN before the refund is posted.`,
        });
        if (!approved) return;
      } catch (err) {
        setError(err?.message || "The supervisor PIN was not accepted.");
        return;
      }
    }
    // Returns refund in one mode; a split choice left over from a sale falls back to cash.
    const payMode = useCredit || (isReturn && moneyMode === "split") ? "cash" : moneyMode;
    const moneyParts = useCredit
      ? null
      : payMode === "cash_upi"
        ? { cash: Number(receivedCash || 0), upi: Number(receivedUpi || 0) }
        : payMode === "split"
          ? splitStatus.parts
          : null;
    const payLabel = payMode === "split" ? counterTenderLabel(moneyParts) : counterPayLabel(payMode);
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
          useCredit ? "Khata" : payLabel,
          selectedParty?.name ? selectedParty.name : "",
          String(paymentRef || "").trim() ? `Ref ${String(paymentRef).trim()}` : "",
        ].filter(Boolean).join(" · "),
        itemLines: chargeLines,
        intra,
        taxInclusive: false,
        gstEnabled,
        roundOffAdjustment: roundOffDiff,
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
        const customer = receiptCustomer();
        const printBill = buildTillBill({ draft, moneyParts, payMode, voucherId, total, isReturn, customer });
        rememberLastBill({
          voucherId,
          total,
          at: new Date().toISOString(),
          lines: lines.length,
          isReturn,
          printBill,
          offlineRef: printBill.offlineRef,
          receiptLines: chargeLines,
          receiptTotals: totals,
          payLabel: useCredit ? "Khata" : payLabel,
          customerName: customer.name,
          customerPhone: customer.phone,
        });
        clearBill();
        setPrintNotice("Bill posted. Use Print receipt below for the thermal slip.");
        window.setTimeout(() => setPrintNotice(""), 20000);
        try {
          await onPosted?.(voucherId);
        } catch {
          /* Post already succeeded — refresh can retry from Day Book. */
        }
      } catch (err) {
        if (isLikelyNetworkError(err) && !useCredit && !isReturn && payMode !== "split") {
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

  const shareLastReceipt = async () => {
    if (!lastBill) {
      setPrintNotice("Charge a bill first, then share from Print receipt.");
      return;
    }
    const receiptTotals = lastBill.receiptTotals || { taxable: lastBill.total, tax: 0, taxLabel: "", total: lastBill.total };
    const partyPhone = billPhone(lastBill);
    const text = buildCounterWhatsAppReceipt({
      companyName: branding?.companyName || activeCompany?.name || "Store",
      companyPhone: branding?.companyPhone || "",
      companyGstin: branding?.companyGstin || "",
      companyAddress: branding?.companyAddress || "",
      tillLabel,
      cashierName: cashierName || "",
      billNo: lastBill.printBill?.offlineRef || lastBill.offlineRef || lastBill.voucherId || "",
      isReturn: Boolean(lastBill.isReturn),
      isCredit: Boolean(lastBill.payLabel === "Khata"),
      payLabel: lastBill.payLabel || "",
      customerName: lastBill.customerName || "",
      customerPhone: partyPhone,
      lines: lastBill.receiptLines || [],
      taxable: receiptTotals.taxable,
      tax: receiptTotals.tax,
      cgst: receiptTotals.cgst,
      sgst: receiptTotals.sgst,
      igst: receiptTotals.igst,
      taxLabel: receiptTotals.taxLabel,
      total: receiptTotals.total || lastBill.total,
      date: lastBill.printBill?.date || today,
    });

    // Customer number entered: go straight to that customer's chat (wa.me) with the bill
    // text plus a link to the PDF. The share sheet below can attach a PDF but can't be
    // told the recipient, so it's kept only for bills without a number.
    if (canWhatsAppShare(partyPhone)) {
      if (!window.confirm(`Send this receipt to ${partyPhone} on WhatsApp? Nothing is sent until you tap send in WhatsApp.`)) {
        return;
      }
      const pending = receiptLinkFor(lastBill);
      const link = pending ? await pending : "";
      openManualWhatsAppShare({
        phone: partyPhone,
        message: withReceiptLink(text, link),
        note: link ? "" : "Sent as text only: the PDF link needs an internet connection.",
      });
      return;
    }

    // No number on the bill: on a phone/tablet, hand WhatsApp the actual receipt PDF via
    // the native share sheet (same as "+ New sale"), and pick the chat there.
    if (lastBill.printBill && invoicePdfShareOnThisDevice(navigator.userAgent, navigator.maxTouchPoints)) {
      const invoice = billToInvoice(lastBill.printBill);
      const file = invoice ? salesInvoicePdfFile(invoice) : null;
      const canGivePdfToWhatsApp = Boolean(
        file
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] }),
      );
      if (canGivePdfToWhatsApp) {
        if (!window.confirm("Share this receipt as a PDF on WhatsApp? Nothing is sent until you choose a chat and tap send.")) {
          return;
        }
        try {
          await navigator.share({ files: [file], title: file.name });
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
          // Any other failure falls through to the text-message share below.
        }
      }
    }

    if (!window.confirm("No customer phone on this bill. Open WhatsApp with the receipt text to pick a chat?")) {
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
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
      if (event.key === "Escape") {
        if (document.activeElement === searchRef.current || String(query || "").trim()) {
          event.preventDefault();
          setQuery("");
          setCategoryFilter("");
          searchRef.current?.focus();
        }
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
  }, [query]);

  const voidBill = bill => {
    if (!(canManage || needsSupervisor) || !askReason || !bill?.id) return;
    askReason("Void counter bill", "Void bill", reason => (async () => {
      setError("");
      try {
        if (needsSupervisor) {
          const approved = await approveWithSupervisor({
            action: "void",
            voucherId: bill.id,
            reason: reason || "Counter void",
            title: "Supervisor PIN to void",
            note: `Void ${bill.reference || bill.voucherNumber || "this bill"} (${money(billTotal(bill))}). A supervisor must enter the PIN.`,
          });
          if (!approved) return;
        }
        setBusy(true);
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
        cashIn: cashTotals.cashIn,
        cashOut: cashTotals.cashOut,
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
    <div className={`acc-panel counter-workspace${tillFull ? " is-full" : ""}`}>
      {pinPrompt ? (
        <SupervisorPinDialog
          title={pinPrompt.title}
          note={pinPrompt.note}
          onSubmit={pin => { pinPrompt.resolve(pin); setPinPrompt(null); }}
          onCancel={() => { pinPrompt.resolve(null); setPinPrompt(null); }}
        />
      ) : null}
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
          </div>
        </div>
        <div className="counter-head-actions">
          <button
            type="button"
            className={`btn counter-full-toggle${tillFull ? " primary" : ""}`}
            aria-pressed={tillFull}
            onClick={toggleTillFull}
          >
            {tillFull ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
            {" "}
            {tillFull ? "Exit full screen" : "Full screen"}
          </button>
          <button
            type="button"
            className={`btn${askOpen ? " primary" : ""}`}
            aria-expanded={askOpen}
            onClick={() => setAskOpen(open => !open)}
          >
            <MessageCircleQuestion size={16} aria-hidden="true" />
            {" "}
            Ask
          </button>
          <button
            type="button"
            className="btn"
            disabled={!online}
            title={!online ? "Cash in / out needs the internet" : undefined}
            onClick={() => { setCashOpen(true); loadCashMovements(); }}
          >
            <Banknote size={16} aria-hidden="true" />
            {" "}
            Cash in / out{tillCash.length ? ` · ${tillCash.length}` : ""}
          </button>
          <button
            type="button"
            className={`btn${panel === "today" ? " primary" : ""}`}
            onClick={() => setPanel(current => (current === "today" ? "bill" : "today"))}
          >
            <History size={16} aria-hidden="true" />
            {" "}
            {panel === "today" ? "Back to till" : `Today${todayBills.length ? ` · ${todayBills.length}` : ""}`}
          </button>
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

      {cashOpen ? (
        <CounterCashDialog
          token={token}
          online={online}
          canManage={canManage}
          closed={Boolean(closed)}
          unavailable={cashUnavailable}
          date={today}
          tillId={activeTillId}
          tillLabel={tillLabel}
          cashierName={cashierName}
          accounts={workingAccounts}
          movements={tillCash}
          onChanged={loadCashMovements}
          onPosted={() => onPosted?.()}
          onClose={() => setCashOpen(false)}
        />
      ) : null}
      {error ? <p className="acc-form-error" role="alert">{error}</p> : null}
      {printNotice ? (
        <div className="notice counter-print-bar is-active" role="status">
          <p>{printNotice}</p>
          {canPrintLastBill ? (
            <div className="counter-print-actions">
              <button type="button" className="btn primary counter-print-cta" onClick={printLastBill}>
                Print receipt
              </button>
              <button type="button" className="btn counter-print-cta" onClick={shareLastReceipt}>
                <Share2 size={16} aria-hidden="true" /> Share
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
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
      {askOpen ? (
        <section className="card counter-ask" aria-label="Ask Counter">
          <header className="counter-ask-head">
            <div>
              <p className="acc-intel-kicker">Ask Counter</p>
              <p className="small">Read-only answers for this till and stock. Nothing is posted or sent.</p>
            </div>
            <button type="button" className="btn" onClick={() => setAskOpen(false)}>Close</button>
          </header>
          <form
            className="counter-ask-form"
            onSubmit={event => {
              event.preventDefault();
              runAskCounter(askQuery);
            }}
          >
            <input
              aria-label="Ask Counter question"
              value={askQuery}
              placeholder="Cash sales today, how much toor left…"
              onChange={event => setAskQuery(event.target.value)}
            />
            <button type="submit" className="btn primary">Ask</button>
          </form>
          <div className="counter-ask-prompts">
            {COUNTER_ASK_PROMPTS.map(prompt => (
              <button
                key={prompt.id}
                type="button"
                className="btn counter-ask-prompt"
                onClick={() => runAskCounter(prompt.question)}
              >
                {prompt.label}
              </button>
            ))}
          </div>
          {askAnswer ? (
            <div className="counter-ask-answer">
              <strong>{askAnswer.title}</strong>
              <p>{askAnswer.summary}</p>
              {askAnswer.lines?.length ? (
                <ul className="counter-ask-lines">
                  {askAnswer.lines.map(line => (
                    <li key={`${line.label}-${line.detail}-${line.amount}`}>
                      <span>
                        <strong>{line.label}</strong>
                        {line.detail ? <em>{line.detail}</em> : null}
                      </span>
                      {line.amount == null ? null : <span>{money(line.amount)}</span>}
                    </li>
                  ))}
                </ul>
              ) : null}
              {askAnswer.source ? <p className="small">{askAnswer.source}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

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
            {dayReport.returnCount ? (
              <article className="counter-dayreport-kpi">
                <span>Refunds · {dayReport.returnCount}</span>
                <strong>{money(-(dayReport.refunds?.total || 0))}</strong>
              </article>
            ) : null}
            <article className="counter-dayreport-kpi">
              <span>{dayReport.refunds?.cash ? "Cash (after refunds)" : "Cash"}</span>
              <strong>{money(dayReport.netTender?.cash ?? dayReport.tender.cash)}</strong>
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
                        {onWhatsAppShare && !bill.isReturn ? (
                          <button type="button" className="btn whatsapp" onClick={() => onWhatsAppShare(bill.id)} title="Share this bill on WhatsApp">WhatsApp</button>
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
              <input
                inputMode="decimal"
                autoComplete="off"
                value={openingFloat}
                onChange={event => setOpeningFloat(event.target.value)}
                disabled={Boolean(closed)}
                aria-label="Opening float"
                placeholder="0.00"
              />
            </FieldBlock>
            <FieldBlock label="Expected cash (float + cash bills + cash in − cash out)">
              <input readOnly value={expectedCash} />
            </FieldBlock>
            <FieldBlock label="Cash in / out today">
              <input readOnly value={`+${cashTotals.cashIn} / −${cashTotals.cashOut}`} aria-label="Cash in and cash out today" />
            </FieldBlock>
            <FieldBlock label="Counted cash">
              <input
                inputMode="decimal"
                autoComplete="off"
                value={countedCash}
                onChange={event => setCountedCash(event.target.value)}
                disabled={Boolean(closed)}
                aria-label="Counted cash"
                placeholder="0.00"
              />
            </FieldBlock>
            <FieldBlock label="Variance">
              <input readOnly value={variance} />
            </FieldBlock>
            <FieldBlock label="Reason (if variance)">
              <input value={closeReason} onChange={event => setCloseReason(event.target.value)} disabled={Boolean(closed)} placeholder="Shortage / overage note" />
            </FieldBlock>
          </div>
          <p className="small">{todayBills.length} counter bill{todayBills.length === 1 ? "" : "s"} today.</p>
          <div className="counter-dayclose-brief">
            <h3 className="acc-subsection-title">Owner brief</h3>
            <pre className="counter-dayclose-brief-text">{dayCloseBrief}</pre>
            <button type="button" className="btn" onClick={shareDayCloseBrief}>
              <Share2 size={16} aria-hidden="true" /> Share on WhatsApp
            </button>
          </div>
          {!closed ? (
            <button type="button" className="btn primary" onClick={saveClose}>Close till for today</button>
          ) : (
            <p className="small">Already closed at {new Date(closed.closedAt).toLocaleString("en-IN")}.</p>
          )}
        </section>
      ) : null}

      {panel === "today" ? (
        <section className="counter-today-panel card" aria-label="Today's counter bills">
          <div className="counter-today-panel-head">
            <div>
              <h2 className="acc-subsection-title">Today · {tillLabel}</h2>
              <p className="small">
                Reprint a receipt{canManage ? " or void a mistake" : needsSupervisor ? " or void a mistake with the supervisor PIN" : ""}. Day totals stay on Day report.
              </p>
            </div>
            <button type="button" className="btn" onClick={() => setPanel("bill")}>Back to till</button>
          </div>
          {todayBills.length ? (
            <ul className="counter-today-panel-list">
              {todayBills.map(bill => {
                const time = formatIstTime(rowInstant(bill));
                return (
                  <li key={bill.id} className="counter-today-panel-row">
                    <div className="counter-today-panel-copy">
                      <strong>{bill.reference || bill.voucherNumber || "Bill"}</strong>
                      <span className="small">
                        {time ? `${time} · ` : ""}
                        {money(billTotal(bill))}
                      </span>
                    </div>
                    <div className="counter-today-panel-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={!onReprint}
                        onClick={() => onReprint?.(bill.id)}
                      >
                        Print
                      </button>
                      {onWhatsAppShare ? (
                        <button
                          type="button"
                          className="btn whatsapp"
                          onClick={() => onWhatsAppShare(bill.id)}
                          title="Share this bill on WhatsApp"
                        >
                          WhatsApp
                        </button>
                      ) : null}
                      {canManage || needsSupervisor ? (
                        <button
                          type="button"
                          className="btn counter-void"
                          disabled={busy}
                          onClick={() => voidBill(bill)}
                          title="Void bill"
                        >
                          <RotateCcw size={14} aria-hidden="true" /> Void
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="small">No Counter bills for this till today yet.</p>
          )}
          {todayBills.length >= 40 ? (
            <p className="small">Showing the latest 40. Older bills are on Day report.</p>
          ) : null}
        </section>
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
      <>
      <div className="counter-grid">
        <section className="counter-catalog card counter-panel">
          <div className="counter-panel-head">
            <h2 className="counter-panel-title">Find items</h2>
            <div className="counter-panel-tools">
              <span className="small counter-kbd">F2</span>
              <AccShortcutsPanel variant="counter" />
            </div>
          </div>
          <div className="counter-search-row">
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
              placeholder="Scan barcode or type name / SKU (tur ≈ toor)"
              aria-label="Search items or scan SKU or barcode"
              autoFocus
            />
          </label>
          {cameraScanSupported() && workingItems.length ? (
            <button type="button" className="btn counter-scan-btn" onClick={() => setScanOpen(true)} aria-label="Scan a barcode with the camera">
              <ScanBarcode size={18} aria-hidden="true" /> Scan
            </button>
          ) : null}
          </div>
          {scanOpen ? <CounterCameraScanner onCode={addScannedCode} onClose={() => setScanOpen(false)} /> : null}
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
            <div className="counter-browse">
              <p className="small counter-browse-hint">
                Barcode, SKU, brand, or name — Enter adds.
                <span className="counter-keys-hint"> Esc clears · Hold F4 · Charge F9.</span>
              </p>
              {categoryChips.length ? (
                <div className="counter-category-chips" role="list" aria-label="Categories">
                  {categoryChips.map(label => (
                    <button
                      key={label}
                      type="button"
                      role="listitem"
                      className={`btn counter-category-chip${categoryFilter === label ? " primary" : ""}`}
                      onClick={() => setCategoryFilter(current => (current === label ? "" : label))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              {browseHasBestSellers ? <p className="small counter-browse-label">Most sold in the last 14 days</p> : null}
              {browseItems.length ? (
                <ul className="counter-item-list counter-browse-list">
                  {browseItems.map(item => {
                    const stock = Number(stockByItem[item.id] ?? 0);
                    const low = item.itemType !== "service" && stock <= 0;
                    const unit = itemUnitLabel(item);
                    return (
                      <li key={item.id} className={`counter-item${low ? " is-low" : ""}`}>
                        <div className="counter-item-copy">
                          <span className="counter-item-name">{item.name}</span>
                          <span className="small">
                            {[item.sku ? `SKU ${item.sku}` : "No SKU", unit ? `Stock ${stock} ${unit}` : ""].filter(Boolean).join(" · ")}
                          </span>
                          {low ? <span className="counter-item-out">Out of stock</span> : null}
                        </div>
                        <strong className="counter-item-price">
                          {money(item.sellingPrice || 0)}
                          {unit ? <span className="counter-item-per"> / {unit}</span> : null}
                        </strong>
                        <button type="button" className="btn counter-item-add" onClick={() => addItem(item)} aria-label={`Add ${item.name} to bill`}>
                          <Plus size={16} aria-hidden="true" /> Add
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {favouriteItems.length ? (
                <div className="counter-fav-grid" role="list" aria-label="Favourites">
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
                          item.sku ? `SKU ${item.sku}` : "No SKU",
                          item.batchNo ? `Batch ${item.batchNo}` : "",
                          itemExpiryStatus(item.expiryDate, { today }).label,
                          itemUnitLabel(item) ? `Stock ${stock} ${itemUnitLabel(item)}` : "",
                        ].filter(Boolean).join(" · ")}
                      </span>
                      {low ? <span className="counter-item-out">Out of stock</span> : null}
                    </div>
                    <strong className="counter-item-price">
                      {money(item.sellingPrice || 0)}
                      {itemUnitLabel(item) ? <span className="counter-item-per"> / {itemUnitLabel(item)}</span> : null}
                    </strong>
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
                        inputMode="decimal"
                        autoComplete="off"
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
            <button type="button" className={`btn${tillMode === "return" ? " primary" : ""}`} disabled={busy} onClick={() => { setTillMode("return"); setSettlement("paid"); setPartyId(CASH_PARTY_ID); if (moneyMode === "split") setMoneyMode("cash"); }}>Return</button>
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
              <>
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
                {selectedParty && khataRisk ? (
                  <div
                    className={`counter-khata-risk is-${khataRisk.severity}${creditAdvice?.level === "block" ? " is-block" : ""}`}
                    role="status"
                    aria-label="Khata risk"
                  >
                    <div className="counter-khata-chips">
                      {khataRisk.chips.map(chip => (
                        <span key={chip.id} className="counter-khata-chip">
                          <em>{chip.label}</em>
                          <strong>{chip.value}</strong>
                        </span>
                      ))}
                    </div>
                    {khataRisk.messages?.length ? (
                      <p className={`small counter-outstanding${khataRisk.severity !== "info" ? " is-due" : ""}`}>
                        {khataRisk.messages[0]}
                      </p>
                    ) : (
                      <p className="small">Internal MyFinTracker credit score from this customer’s invoices — not a bureau score.</p>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="counter-walkin" aria-label="Customer">Cash (walk-in)</p>
                <input
                  className="counter-walkin-input"
                  type="text"
                  autoComplete="name"
                  placeholder="Customer name (optional)"
                  value={walkInName}
                  disabled={busy}
                  onChange={event => setWalkInName(event.target.value)}
                />
                <input
                  className="counter-walkin-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="WhatsApp phone (optional)"
                  value={walkInPhone}
                  disabled={busy}
                  onChange={event => setWalkInPhone(event.target.value)}
                />
                <p className="small">Optional — used for WhatsApp receipt. Choose Khata for a saved customer.</p>
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
            {discountOff > 0 ? (
              <p className="small counter-discount-hint">{money(discountOff)} off this bill</p>
            ) : null}
          </FieldBlock>
          <label className="counter-roundoff-toggle">
            <input
              type="checkbox"
              checked={roundOff}
              onChange={event => setRoundOff(event.target.checked)}
              disabled={busy || !lines.length}
              aria-label={tillMode === "return" ? "Round off the refund" : "Round off"}
            />
            <span>{tillMode === "return"
              ? "Round the refund to the nearest rupee (match the original bill)"
              : "Round off to the nearest rupee"}</span>
          </label>
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
                  {PAY_MODES.filter(mode => (online || (mode.id !== "bank" && mode.id !== "split")) && (tillMode !== "return" || mode.id !== "split")).map(mode => (
                    <option key={mode.id} value={mode.id}>{mode.label}</option>
                  ))}
                </Select>
              </FieldBlock>
              {moneyMode === "cash" ? (
                <FieldBlock label="Cash tendered">
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={tenderedCash}
                    onChange={event => setTenderedCash(event.target.value)}
                    placeholder="Amount received"
                    disabled={busy || !lines.length}
                    aria-label="Cash tendered"
                  />
                </FieldBlock>
              ) : null}
              {moneyMode === "cash_upi" ? (
                <div className="counter-split">
                  <FieldBlock label="Cash">
                    <input
                      inputMode="decimal"
                      autoComplete="off"
                      value={receivedCash}
                      onChange={event => setReceivedCash(event.target.value)}
                      aria-label="Cash amount"
                      placeholder="0.00"
                    />
                  </FieldBlock>
                  <FieldBlock label="UPI">
                    <input
                      inputMode="decimal"
                      autoComplete="off"
                      value={receivedUpi}
                      onChange={event => setReceivedUpi(event.target.value)}
                      aria-label="UPI amount"
                      placeholder="0.00"
                    />
                  </FieldBlock>
                </div>
              ) : null}
              {splitActive ? (
                <>
                  <div className="counter-split counter-split-three">
                    <FieldBlock label="Cash">
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        value={receivedCash}
                        onChange={event => setReceivedCash(event.target.value)}
                        aria-label="Cash amount"
                        placeholder="0.00"
                        disabled={busy || !lines.length}
                      />
                    </FieldBlock>
                    <FieldBlock label="UPI">
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        value={receivedUpi}
                        onChange={event => setReceivedUpi(event.target.value)}
                        aria-label="UPI amount"
                        placeholder="0.00"
                        disabled={busy || !lines.length}
                      />
                    </FieldBlock>
                    <FieldBlock label="Card">
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        value={receivedCard}
                        onChange={event => setReceivedCard(event.target.value)}
                        aria-label="Card amount"
                        placeholder="0.00"
                        disabled={busy || !lines.length}
                      />
                    </FieldBlock>
                  </div>
                  {lines.length ? (
                    <p className={`small counter-split-status${splitStatus.ok ? " is-ok" : ""}`} role="status">
                      {splitStatus.ok
                        ? `Adds up to ${money(chargeTotal)}.`
                        : splitStatus.remaining > 0
                          ? `${money(splitStatus.remaining)} still to collect.`
                          : splitStatus.remaining < 0
                            ? `${money(Math.abs(splitStatus.remaining))} more than the bill.`
                            : "Enter at least two amounts."}
                    </p>
                  ) : null}
                </>
              ) : null}
              {moneyMode === "upi" || moneyMode === "bank" || moneyMode === "cash_upi" || moneyMode === "split" ? (
                <FieldBlock label="Payment ref (optional)">
                  <input
                    value={paymentRef}
                    onChange={event => setPaymentRef(event.target.value)}
                    placeholder="UTR / txn id"
                    aria-label="Payment reference"
                    disabled={busy}
                  />
                </FieldBlock>
              ) : null}
              {upiLink ? (
                <div className="counter-upi-qr">
                  <QrSvg text={upiLink} size={120} label="UPI QR for this bill" />
                  <p className="small">Scan to pay {money(moneyMode === "split" ? Number(receivedUpi) || 0 : chargeTotal)} via UPI</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="small">Khata bill — no tender. Collect later from Accounts.</p>
          )}

          {blockOversell && oversellLines.length ? (
            <p className="acc-form-error" role="alert">
              Short stock: {oversellLines.map(row => `${row.name} (need ${row.need}, have ${row.stock})`).join("; ")}.
            </p>
          ) : null}

          <div className="counter-pay-foot">
          <div className="counter-totals">
            {discountOff > 0 ? (
              <div className="counter-discount-row">
                <span>Discount{String(billDiscount).trim().endsWith("%") ? ` (${String(billDiscount).trim()})` : ""}</span>
                <strong>−{money(discountOff)}</strong>
              </div>
            ) : null}
            <div><span>Taxable</span><strong>{money(totals.taxable)}</strong></div>
            {gstEnabled ? <div><span>{totals.taxLabel || "GST"}</span><strong>{money(totals.tax)}</strong></div> : null}
            {roundOffActive ? (
              <div className="counter-roundoff-row">
                <span>Round off</span>
                <strong>{roundOffDiff >= 0 ? `+${money(roundOffDiff)}` : `−${money(Math.abs(roundOffDiff))}`}</strong>
              </div>
            ) : null}
            <div className="counter-total-due"><span>{tillMode === "return" ? "Refund" : "Total due"}</span><strong>{money(chargeTotal)}</strong></div>
            {changeDue != null ? (
              <div className={changeDue < 0 ? "counter-change is-short" : "counter-change"}>
                <span>{changeDue < 0 ? "Short" : "Change"}</span>
                <strong>{money(Math.abs(changeDue))}</strong>
              </div>
            ) : null}
          </div>

          <div className="counter-pay-actions">
            <button type="button" className="btn counter-hold-btn" disabled={!lines.length || busy || Boolean(closed)} onClick={holdBill}>
              <Pause size={16} aria-hidden="true" /> Hold
            </button>
            <button
              type="button"
              className="btn primary counter-charge"
              disabled={
                !lines.length
                || busy
                || saving
                || Boolean(closed)
                || offlineBlock.blocked
                || !workingAccounts.length
                || creditAdvice?.level === "block"
                || (blockOversell && oversellLines.length > 0)
                || cashTenderMissing
                || splitInvalid
              }
              onClick={charge}
            >
              {busy
                ? (online ? "Posting…" : "Saving offline…")
                : `${tillMode === "return" ? "Refund" : settlement === "credit" ? "Post khata" : online ? "Charge" : "Charge offline"} ${money(chargeTotal)}`}
            </button>
          </div>
          {chargeBlockReason ? <p className="small counter-charge-reason" role="status">{chargeBlockReason}</p> : null}
          </div>
          <p className="small counter-pay-note">
            {settlement === "credit"
              ? "Khata posts to the customer ledger."
              : "UPI/card confirmation is outside MyFinTracker unless you scan the QR above."}
          </p>
        </section>
      </div>

      {lines.length ? (
        <div className="counter-mobile-paybar" aria-label="Charge bar">
          <div className="counter-mobile-paybar-total">
            <span className="small">{tillMode === "return" ? "Refund" : "Due"}</span>
            <strong>{money(chargeTotal)}</strong>
            {chargeBlockReason ? <span className="small counter-charge-reason">{chargeBlockReason}</span> : null}
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={
              !lines.length
              || busy
              || saving
              || Boolean(closed)
              || offlineBlock.blocked
              || !workingAccounts.length
              || creditAdvice?.level === "block"
              || (blockOversell && oversellLines.length > 0)
              || cashTenderMissing
              || splitInvalid
            }
            onClick={charge}
          >
            {busy ? "…" : tillMode === "return" ? "Refund" : settlement === "credit" ? "Khata" : "Charge"}
          </button>
        </div>
      ) : null}
      </>
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
