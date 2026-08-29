import { useEffect, useMemo, useState } from "react";
import { buildChitUpcomingRows, buildMonthlyUpcoming, buildReminderReceipt, filterUpcomingPayments, formatDueDate, formatDueLabel } from "./upcomingPayments.js";
import { buildReminderMessage, canWhatsAppShare, openWhatsAppShare } from "./receiptWhatsApp.js";
import { loadPaymentReminderLog, loadUpcomingChitPayments, markPaymentReminderSent } from "../../lib/financeRepository.js";

const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const MODULE_FILTERS = [["7days", "7 days"], ["3days", "3 days"], ["today", "Due today"], ["all", "All"]];

export function UpcomingPaymentsSection({ loans = [], token, settings, workspace, isOwner, moduleType, refreshKey = 0 }) {
  const isMonthly = moduleType === "monthly";
  const [filter, setFilter] = useState(isMonthly ? "7days" : "all");
  const [chitRows, setChitRows] = useState([]);
  const [reminderLog, setReminderLog] = useState([]);
  const agentId = workspace?.id || "";
  const title = isMonthly ? "Upcoming monthly payments" : "Upcoming chit installments";

  useEffect(() => {
    if (!token) return;
    if (!isMonthly) {
      loadUpcomingChitPayments(token).then(setChitRows).catch(() => setChitRows([]));
    }
    loadPaymentReminderLog(token).then(setReminderLog).catch(() => setReminderLog([]));
  }, [token, loans, isMonthly, refreshKey]);

  const monthlyItems = useMemo(() => {
    if (!isMonthly) return [];
    const visible = isOwner ? loans : loans.filter(loan => loan.collectionAgentId === agentId);
    return buildMonthlyUpcoming(visible.filter(loan => loan.kind === "monthly"));
  }, [loans, isOwner, agentId, isMonthly]);

  const chitItems = useMemo(() => (isMonthly ? [] : buildChitUpcomingRows(chitRows)), [chitRows, isMonthly]);
  const sourceItems = isMonthly ? monthlyItems : chitItems;
  const allItems = useMemo(() => filterUpcomingPayments(sourceItems, filter), [sourceItems, filter]);

  const sendReminder = async item => {
    const templateKey = item.type === "monthly" ? "monthly_reminder" : "chit_reminder";
    const receipt = buildReminderReceipt(item, settings);
    if (!canWhatsAppShare(item.phone)) return;
    openWhatsAppShare({ phone: item.phone, message: buildReminderMessage(receipt, settings, templateKey) });
    const daysBefore = item.daysRemaining;
    await markPaymentReminderSent(token, item.type === "monthly" ? "monthly_finance" : "chit_fund", item.sourceId, item.cycleKey, daysBefore);
    setReminderLog(current => [...current, {
      reminder_source: item.type === "monthly" ? "monthly_finance" : "chit_fund",
      source_id: item.sourceId,
      cycle_key: item.cycleKey,
      days_before: daysBefore,
    }]);
  };

  return <div className="card spacer upcoming-payments">
    <div className="toolbar upcoming-payments-toolbar">
      <strong>{title}</strong>
      <div className="tabs upcoming-payments-filters">
        {MODULE_FILTERS.map(([id, label]) =>
          <button key={id} type="button" className={`btn tab ${filter === id ? "active" : ""}`} onClick={() => setFilter(id)}>{label}</button>,
        )}
      </div>
    </div>
    {!allItems.length && <p className="small">No upcoming payments match this filter.</p>}
    {!!allItems.length && <>
      {allItems.length > 50 && <p className="small">Showing first 50 of {allItems.length} reminders.</p>}
      <div className={`table spacer upcoming-payments-table ${isMonthly ? "monthly" : "chit"}`}><table><thead><tr><th>Customer</th>{!isMonthly && <><th>Scheme</th><th>Type</th></>}<th>Amount</th><th>Due</th><th></th></tr></thead><tbody>
      {allItems.slice(0, 50).map(item => <tr key={`${item.type}-${item.sourceId}-${item.cycleKey}`}>
        <td><strong>{item.customerName}</strong>{isMonthly && item.phone && <div className="small">{item.phone}</div>}</td>
        {!isMonthly && <><td>{item.schemeName || "Chit Fund"}</td><td><span className="chit-type-badge">{item.chitTypeLabel || "—"}</span></td></>}
        <td className="gold">{money(item.amount)}</td>
        <td>{formatDueDate(item)} · {formatDueLabel(item)}</td>
        <td>{canWhatsAppShare(item.phone)
          ? <button type="button" className="btn whatsapp" onClick={() => sendReminder(item)}>WhatsApp</button>
          : <span className="small">No phone</span>}</td>
      </tr>)}
    </tbody></table></div>
    </>}
  </div>;
}

export function UpcomingPaymentCard({ item, settings, token, reminderLog = [], onReminderSent }) {
  const sendReminder = async () => {
    const templateKey = item.type === "monthly" ? "monthly_reminder" : "chit_reminder";
    const receipt = buildReminderReceipt(item, settings);
    if (!canWhatsAppShare(item.phone)) return;
    openWhatsAppShare({ phone: item.phone, message: buildReminderMessage(receipt, settings, templateKey) });
    await markPaymentReminderSent(token, item.type === "monthly" ? "monthly_finance" : "chit_fund", item.sourceId, item.cycleKey, item.daysRemaining);
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
      return <div key={day}>{sent ? `✓ ${day === 0 ? "Due date" : `${day}-day`} reminder sent` : `○ ${day === 0 ? "Due date" : `${day}-day`} reminder pending`}</div>;
    })}</div>
    {canWhatsAppShare(item.phone)
      ? <button type="button" className="btn whatsapp spacer" onClick={sendReminder}>Send WhatsApp Reminder</button>
      : <p className="small">WhatsApp unavailable</p>}
  </div>;
}
