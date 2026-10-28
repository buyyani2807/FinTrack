import { AccMetric, AccTable } from "../../components/AccUi.jsx";
import { money } from "../../accountsFormat.js";
import { periodCaption } from "./reportStatementRows.js";

export function TrialBalanceReport({ tb, rangeFrom = "", rangeTo = "", companyName = "" }) {
  const diff = Math.abs(Number(tb.totalDebit || 0) - Number(tb.totalCredit || 0));
  const balanced = diff < 0.01;
  const meta = [companyName, periodCaption(rangeFrom, rangeTo)].filter(Boolean).join(" · ");
  return (
    <section className="acc-stmt" aria-label="Trial Balance">
      <header className="acc-stmt-head">
        <h3 className="acc-stmt-title">Trial Balance</h3>
        {meta ? <p className="acc-stmt-period">{meta}</p> : null}
      </header>
      <div className="acc-metric-grid three spacer">
        <AccMetric label="Total debit" value={money(tb.totalDebit)} />
        <AccMetric label="Total credit" value={money(tb.totalCredit)} />
        <AccMetric label="Difference" value={money(diff)} tone={balanced ? "green" : "red"} />
      </div>
      <div className="acc-stmt-table-wrap">
        <AccTable columns={["Code", "Account", { label: "Debit", num: true }, { label: "Credit", num: true }]}>
          {tb.rows.map(row => (
            <tr key={row.id}>
              <td>{row.code}</td>
              <td>{row.name}</td>
              <td className="acc-num">{row.debit ? money(row.debit) : ""}</td>
              <td className="acc-num">{row.credit ? money(row.credit) : ""}</td>
            </tr>
          ))}
          <tr className="acc-stmt-total">
            <td></td>
            <td><strong>Total</strong></td>
            <td className="acc-num"><strong>{money(tb.totalDebit)}</strong></td>
            <td className="acc-num"><strong>{money(tb.totalCredit)}</strong></td>
          </tr>
        </AccTable>
      </div>
    </section>
  );
}
