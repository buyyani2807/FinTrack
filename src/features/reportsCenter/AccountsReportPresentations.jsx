import { money, profitResult } from "../accounts/accountsFormat.js";
import { invoiceAgingTotals } from "../accounts/model/accountingReports.js";
import { ReportShell } from "./ReportShell.jsx";
import { BucketBars, CompareBars, ShareStack, TwinDonut } from "./ReportCharts.jsx";

function periodLine(from, to) {
  if (!from && !to) return "";
  if (from && to && from === to) return `Period: ${from}`;
  if (from && to) return `Period: ${from} → ${to}`;
  return `Period: ${from || to}`;
}

function Charts({ children }) {
  return <div className="ft-report-charts">{children}</div>;
}

/** Presentation-only shell around existing P&L tables. */
export function PnlShell({ pnl, rangeFrom, rangeTo, children }) {
  const result = profitResult(pnl?.net);
  const income = Number(pnl?.totalIncome || 0);
  const expense = Number(pnl?.totalExpense || 0);
  const insight = result.loss
    ? `Expenses exceeded income by ${money(result.amount)} in this period.`
    : `Income covered expenses with ${money(result.amount)} left as profit.`;
  return (
    <ReportShell
      reportId="pnl"
      periodLabel={periodLine(rangeFrom, rangeTo)}
      metrics={[
        { label: "Income", value: money(income), tone: "good" },
        { label: "Expenses", value: money(expense), tone: expense > income ? "bad" : undefined },
        { label: result.label, value: money(result.amount), tone: result.loss ? "bad" : "good" },
      ]}
      insight={insight}
      insightTone={result.loss ? "warn" : "ok"}
      charts={(
        <Charts>
          <CompareBars
            title="Income vs expenses"
            ariaLabel="Income versus expenses"
            items={[
              { label: "Income", value: income },
              { label: "Expenses", value: expense },
            ]}
          />
        </Charts>
      )}
    >
      {children}
    </ReportShell>
  );
}

export function TrialShell({ tb, rangeFrom, rangeTo, children }) {
  const debit = Number(tb?.totalDebit || 0);
  const credit = Number(tb?.totalCredit || 0);
  const diff = Math.abs(debit - credit);
  const balanced = diff < 0.01;
  return (
    <ReportShell
      reportId="trial"
      periodLabel={periodLine(rangeFrom, rangeTo)}
      metrics={[
        { label: "Total debit", value: money(debit) },
        { label: "Total credit", value: money(credit) },
        { label: "Difference", value: money(diff), tone: balanced ? "good" : "bad" },
      ]}
      insight={balanced ? "Debits equal credits — the trial balance is balanced." : `Debits and credits differ by ${money(diff)}. Check incomplete or mistyped vouchers.`}
      insightTone={balanced ? "ok" : "warn"}
      warnings={balanced ? [] : ["Books do not balance for this period."]}
      charts={(
        <Charts>
          <CompareBars
            title="Debit vs credit"
            ariaLabel="Total debit versus total credit"
            items={[
              { label: "Debit", value: debit },
              { label: "Credit", value: credit },
            ]}
          />
        </Charts>
      )}
    >
      {children}
    </ReportShell>
  );
}

export function BalanceShell({ sheet, rangeFrom, rangeTo, children }) {
  const assets = Number(sheet?.totalAssets || 0);
  const liabilities = Number(sheet?.totalLiabilities || 0);
  const equity = Number(sheet?.totalEquity || 0);
  const right = liabilities + equity;
  return (
    <ReportShell
      reportId="balance"
      periodLabel={periodLine(rangeFrom, rangeTo)}
      metrics={[
        { label: "Assets", value: money(assets) },
        { label: "Liabilities", value: money(liabilities) },
        { label: "Equity", value: money(equity) },
      ]}
      insight={sheet?.balanced
        ? "Assets equal liabilities plus equity."
        : "Assets do not equal liabilities plus equity — review opening balances or equity postings."}
      insightTone={sheet?.balanced ? "ok" : "warn"}
      charts={(
        <Charts>
          <ShareStack
            title="Composition"
            ariaLabel="Assets versus liabilities and equity"
            left={assets}
            right={right}
            leftLabel="Assets"
            rightLabel="Liab. + equity"
          />
        </Charts>
      )}
    >
      {children}
    </ReportShell>
  );
}

export function CashflowShell({ flow, rangeFrom, rangeTo, children }) {
  const inflow = Number(flow?.inflow || 0);
  const outflow = Number(flow?.outflow || 0);
  const net = Number(flow?.net || 0);
  return (
    <ReportShell
      reportId="cashflow"
      periodLabel={periodLine(rangeFrom, rangeTo)}
      metrics={[
        { label: "Inflow", value: money(inflow), tone: "good" },
        { label: "Outflow", value: money(outflow), tone: "bad" },
        { label: "Net cash", value: money(net), tone: net < 0 ? "bad" : "good" },
      ]}
      insight={net < 0
        ? `Outflow exceeded inflow by ${money(Math.abs(net))} (internal transfers excluded).`
        : `Net cash increased by ${money(net)} after excluding internal transfers.`}
      insightTone={net < 0 ? "warn" : "ok"}
      charts={(
        <Charts>
          <CompareBars
            title="Inflow vs outflow"
            ariaLabel="Cash inflow versus outflow"
            items={[
              { label: "Inflow", value: inflow },
              { label: "Outflow", value: outflow },
            ]}
          />
        </Charts>
      )}
    >
      {children}
    </ReportShell>
  );
}

function AgingShell({ reportId, rows, rangeFrom, rangeTo, partyWord, children }) {
  const aging = invoiceAgingTotals(rows || []);
  const overdueShare = aging.total > 0 ? Math.round((aging.overdue / aging.total) * 100) : 0;
  return (
    <ReportShell
      reportId={reportId}
      periodLabel={periodLine(rangeFrom, rangeTo)}
      metrics={[
        { label: "Outstanding", value: money(aging.total) },
        { label: "Current", value: money(aging.current), tone: "good" },
        { label: "Overdue", value: money(aging.overdue), tone: aging.overdue > 0 ? "bad" : "good" },
      ]}
      insight={aging.total <= 0
        ? `No open ${partyWord} balances in this view.`
        : overdueShare > 0
          ? `${overdueShare}% of outstanding is overdue — follow up the oldest buckets first.`
          : `All outstanding is still within due dates.`}
      insightTone={aging.overdue > 0 ? "warn" : "ok"}
      charts={(
        <Charts>
          <TwinDonut
            title="Current vs overdue"
            primary={aging.current}
            secondary={aging.overdue}
            primaryLabel="Current"
            secondaryLabel="Overdue"
            ariaLabel="Current versus overdue outstanding"
          />
          <BucketBars
            title="Ageing"
            ariaLabel="Outstanding by ageing bucket"
            items={[
              { label: "Current", value: aging.current },
              { label: "1–30", value: aging.d1_30, tone: "bad" },
              { label: "31–60", value: aging.d31_60, tone: "bad" },
              { label: "61–90", value: aging.d61_90, tone: "bad" },
              { label: "90+", value: aging.d90, tone: "bad" },
            ]}
          />
        </Charts>
      )}
    >
      {children}
    </ReportShell>
  );
}

export function ReceivablesShell(props) {
  return <AgingShell reportId="receivables" partyWord="customer" {...props} />;
}

export function PayablesShell(props) {
  return <AgingShell reportId="payables" partyWord="supplier" {...props} />;
}

/** Shell + help only (no charts yet). */
export function PlainReportShell({ reportId, rangeFrom, rangeTo, metrics = [], insight = null, insightTone = "info", children }) {
  return (
    <ReportShell
      reportId={reportId}
      periodLabel={periodLine(rangeFrom, rangeTo)}
      metrics={metrics}
      insight={insight}
      insightTone={insightTone}
    >
      {children}
    </ReportShell>
  );
}
