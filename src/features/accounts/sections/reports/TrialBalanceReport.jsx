import { AccMetric, AccTable } from "../../components/AccUi.jsx";
import { money } from "../../accountsFormat.js";

export function TrialBalanceReport({ tb }) {
  return (
    <>
      <div className="acc-metric-grid three spacer">
        <AccMetric label="Total debit" value={money(tb.totalDebit)} />
        <AccMetric label="Total credit" value={money(tb.totalCredit)} />
        <AccMetric label="Difference" value={money(Math.abs(Number(tb.totalDebit || 0) - Number(tb.totalCredit || 0)))} tone={Math.abs(Number(tb.totalDebit || 0) - Number(tb.totalCredit || 0)) < 0.01 ? "green" : "red"} />
      </div>
      <AccTable columns={["Code", "Account", { label: "Debit", num: true }, { label: "Credit", num: true }]}>
      {tb.rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td></tr>)}
      <tr><td></td><td><strong>Total</strong></td><td className="acc-num"><strong>{money(tb.totalDebit)}</strong></td><td className="acc-num"><strong>{money(tb.totalCredit)}</strong></td></tr>
    </AccTable>
    </>
  );
}
