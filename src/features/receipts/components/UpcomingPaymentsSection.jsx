import { useEffect, useId, useMemo, useState } from "react";
import { BellRing, ChevronDown, MessageCircle, RefreshCw } from "lucide-react";
import { SegmentedControl } from "../../../components/ui.jsx";
import { buildChitUpcomingRows, buildMonthlyUpcoming, buildReminderReceipt, filterUpcomingPayments, formatDueDate, formatDueLabel } from "../model/upcomingPayments.js";
import { buildReminderMessage, canWhatsAppShare, openManualWhatsAppShare } from "../io/receiptWhatsApp.js";
import { loadPaymentReminderLog, loadUpcomingChitPayments, markPaymentReminderSent } from "../../../lib/financeRepository.js";
import { formatInr } from "../../../lib/formatMoney.js";

const money = formatInr;
const reminderKey = item => `${item.type}-${item.sourceId}-${item.cycleKey}-${item.daysRemaining}`;

const openReminderWhatsApp = (item, settings) => {
  const templateKey = item.type === "monthly" ? "monthly_reminder" : "chit_reminder";
  const receipt = buildReminderReceipt(item, settings);
  return openManualWhatsAppShare({ phone: item.phone, message: buildReminderMessage(receipt, settings, templateKey) });
};

const MONTHLY_FILTERS = [["7days", "7 days"], ["3days", "3 days"], ["today", "Due today"], ["all", "All"]];
const CHIT_FILTERS = [["3days", "3 days"], ["today", "Due today"]];
const FILTER_WINDOW = { "7days": "in the next 7 days", "3days": "in the next 3 days", today: "today", all: "" };

export function UpcomingPaymentsSection({ loans = [], token, settings, workspace, isOwner, moduleType, refreshKey = 0 }) {
  const isMonthly = moduleType === "monthly";
  const filters = isMonthly ? MONTHLY_FILTERS : CHIT_FILTERS;
  const listId = useId();
  const [filter, setFilter] = useState(isMonthly ? "7days" : "3days");
  const [expanded, setExpanded] = useState(isMonthly);
  const [chitRows, setChitRows] = useState([]);
  const [reminderLog, setReminderLog] = useState([]);
  const [openedKeys, setOpenedKeys] = useState({});
  const [loading, setLoading] = useState(!isMonthly);
  const [error, setError] = useState("");
  const agentId = workspace?.id || "";
  const title = isMonthly ? "Upcoming monthly payments" : "Upcoming installment reminders";
  const collapsible = !isMonthly;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      if (!isMonthly) {
        setLoading(true);
        setError("");
        try {
          const [rows, log] = await Promise.all([
            loadUpcomingChitPayments(token),
            loadPaymentReminderLog(token),
          ]);
          if (cancelled) return;
          setChitRows(rows);
          setReminderLog(log);
        } catch (err) {
          if (cancelled) return;
          setChitRows([]);
          setReminderLog([]);
          setError(err?.message || "Could not load installment reminders.");
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
      try {
        const log = await loadPaymentReminderLog(token);
        if (!cancelled) setReminderLog(log);
      } catch {
        if (!cancelled) setReminderLog([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token, loans, isMonthly, refreshKey]);

  const monthlyItems = useMemo(() => {
    if (!isMonthly) return [];
    const visible = isOwner ? loans : loans.filter(loan => loan.collectionAgentId === agentId);
    return buildMonthlyUpcoming(visible.filter(loan => loan.kind === "monthly"));
  }, [loans, isOwner, agentId, isMonthly]);

  const chitItems = useMemo(() => (isMonthly ? [] : buildChitUpcomingRows(chitRows)), [chitRows, isMonthly]);
  const sourceItems = isMonthly ? monthlyItems : chitItems;
  const allItems = useMemo(() => filterUpcomingPayments(sourceItems, filter), [sourceItems, filter]);
  const visibleItems = allItems.slice(0, 50);
  const showList = !collapsible || expanded;

  const sendReminder = item => {
    if (!canWhatsAppShare(item.phone)) return;
    const opened = openReminderWhatsApp(item, settings);
    if (!opened?.opened) return;
    setOpenedKeys(current => ({ ...current, [reminderKey(item)]: true }));
  };

  const confirmReminderSent = async item => {
    const daysBefore = item.daysRemaining;
    await markPaymentReminderSent(token, item.type === "monthly" ? "monthly_finance" : "chit_fund", item.sourceId, item.cycleKey, daysBefore);
    setReminderLog(current => [...current, {
      reminder_source: item.type === "monthly" ? "monthly_finance" : "chit_fund",
      source_id: item.sourceId,
      cycle_key: item.cycleKey,
      days_before: daysBefore,
    }]);
    setOpenedKeys(current => {
      const next = { ...current };
      delete next[reminderKey(item)];
      return next;
    });
  };

  const retryLoad = () => {
    setError("");
    setLoading(true);
    loadUpcomingChitPayments(token)
      .then(rows => {
        setChitRows(rows);
        setError("");
      })
      .catch(err => {
        setChitRows([]);
        setError(err?.message || "Could not load installment reminders.");
      })
      .finally(() => setLoading(false));
    loadPaymentReminderLog(token).then(setReminderLog).catch(() => setReminderLog([]));
  };

  // One status line under the title: loading, unavailable, or how many payments fall in the chosen window.
  const dueWindow = FILTER_WINDOW[filter] ?? "";
  const statusLine = loading
    ? "Loading reminders…"
    : error
      ? "Reminders are unavailable right now"
      : allItems.length
        ? `${allItems.length} payment${allItems.length === 1 ? "" : "s"} due${dueWindow ? ` ${dueWindow}` : ""}`
        : `Nothing due${dueWindow ? ` ${dueWindow}` : ""}`;
  const errorRow = <div className="upcoming-payments-error" role="alert">
    <p className="small red">{error}</p>
    <button type="button" className="btn" onClick={retryLoad}><RefreshCw size={15} aria-hidden="true" />Retry</button>
  </div>;
  const headText = <>
    <span className="upcoming-payments-icon" aria-hidden="true"><BellRing size={19} /></span>
    <span className="upcoming-payments-title-wrap">
      <span className="upcoming-payments-title"><strong>{title}</strong>{!loading && !error && <span className={`upcoming-payments-count${allItems.length ? "" : " is-zero"}`}>{allItems.length}</span>}</span>
      <span className="upcoming-payments-status">{statusLine}</span>
    </span>
  </>;

  return <section className={`card spacer upcoming-payments ${collapsible ? "collapsible" : ""} ${expanded ? "is-expanded" : "is-collapsed"}`} aria-label={title}>
    {collapsible ? (
      <button
        type="button"
        className="upcoming-payments-head upcoming-payments-toggle"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded(current => !current)}
      >
        {headText}
        <span className="upcoming-payments-toggle-label">{expanded ? "Hide" : "Show"}<ChevronDown size={16} aria-hidden="true" /></span>
      </button>
    ) : <div className="upcoming-payments-head">{headText}</div>}

    {collapsible && !expanded && !loading && error && errorRow}

    {showList && <div id={listId} className="upcoming-payments-body">
      <div className="upcoming-payments-bar">
        <SegmentedControl label="Reminder filters" className="upcoming-payments-filters" options={filters.map(([id, label]) => ({ id, label }))} value={filter} onChange={setFilter} />
        {!loading && !error && allItems.length > 50 && <span className="small">Showing first 50 of {allItems.length}</span>}
      </div>
      {loading && <p className="small upcoming-payments-empty" role="status">Loading installment reminders…</p>}
      {!loading && error && errorRow}
      {!loading && !error && !allItems.length && <p className="upcoming-payments-empty">No payments due{dueWindow ? ` ${dueWindow}` : ""}. Reminders appear here as due dates come up.</p>}
      {!loading && !error && !!allItems.length && <div className={`table upcoming-payments-table ${isMonthly ? "monthly" : "chit"}`}><table><thead><tr><th>Customer</th>{!isMonthly && <><th>Scheme</th><th>Type</th></>}<th>Amount</th><th>Due</th><th><span className="ft-sr-only">Reminder</span></th></tr></thead><tbody>
        {visibleItems.map(item => <tr key={`${item.type}-${item.sourceId}-${item.cycleKey}`}>
          <td><strong>{item.customerName}</strong>{isMonthly && item.phone && <div className="small">{item.phone}</div>}</td>
          {!isMonthly && <><td>{item.schemeName || "Chit Fund"}</td><td><span className="chit-type-badge">{item.chitTypeLabel || "—"}</span></td></>}
          <td className="upcoming-payments-amount">{money(item.amount)}</td>
          <td><span className="upcoming-payments-due">{formatDueDate(item)}</span><span className={`upcoming-payments-when${item.daysRemaining <= 0 ? " is-today" : item.daysRemaining <= 3 ? " is-soon" : ""}`}>{formatDueLabel(item)}</span></td>
          <td>{canWhatsAppShare(item.phone)
            ? openedKeys[reminderKey(item)]
              ? <button type="button" className="btn primary" onClick={() => confirmReminderSent(item)}>Mark sent</button>
              : <button type="button" className="btn whatsapp" onClick={() => sendReminder(item)}><MessageCircle size={15} aria-hidden="true" />WhatsApp</button>
            : <span className="small">No phone</span>}</td>
        </tr>)}
      </tbody></table></div>}
    </div>}
  </section>;
}

export function UpcomingPaymentCard({ item, settings, token, reminderLog = [], onReminderSent }) {
  const [opened, setOpened] = useState(false);
  const sendReminder = () => {
    if (!canWhatsAppShare(item.phone)) return;
    const opened = openReminderWhatsApp(item, settings);
    if (opened?.opened) setOpened(true);
  };
  const confirmSent = async () => {
    await markPaymentReminderSent(token, item.type === "monthly" ? "monthly_finance" : "chit_fund", item.sourceId, item.cycleKey, item.daysRemaining);
    setOpened(false);
    onReminderSent?.();
  };

  const sentFor = daysBefore => reminderLog.some(row =>
    row.reminder_source === (item.type === "monthly" ? "monthly_finance" : "chit_fund")
    && row.source_id === item.sourceId
    && row.cycle_key === item.cycleKey
    && row.days_before === daysBefore,
  );

  return <div className="card spacer upcoming-payment-card">
    <strong>Next Payment</strong>
    <div className="metric-value gold">{money(item.amount)}</div>
    <p className="small">Due Date: {formatDueDate(item)} · {formatDueLabel(item)}</p>
    {item.type === "chit" && item.schemeName && <p className="small">Scheme: {item.schemeName}{item.chitTypeLabel ? ` · ${item.chitTypeLabel}` : ""} · Month {item.monthNumber} of {item.totalMonths}</p>}
    <div className="small spacer">{[7, 3, 1, 0].map(day => {
      const sent = sentFor(day);
      if (!sent && item.daysRemaining > day) return null;
      return <div key={day}>{sent ? `✓ ${day === 0 ? "Due date" : `${day}-day`} reminder marked sent` : `○ ${day === 0 ? "Due date" : `${day}-day`} reminder pending`}</div>;
    })}</div>
    {canWhatsAppShare(item.phone)
      ? opened
        ? <button type="button" className="btn primary spacer" onClick={confirmSent}>Mark reminder sent</button>
        : <button type="button" className="btn whatsapp spacer" onClick={sendReminder}>Open WhatsApp</button>
      : <p className="small">WhatsApp unavailable</p>}
  </div>;
}
