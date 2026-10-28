import { AccTable } from "../../components/AccUi.jsx";
import { money } from "../../accountsFormat.js";

export function TrialBalanceReport({ tb }) {
  return (
    <AccTable columns={["Code", "Account", { label: "Debit", num: true }, { label: "Credit", num: true }]}>
      {tb.rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td className="acc-num">{row.debit ? money(row.debit) : ""}</td><td className="acc-num">{row.credit ? money(row.credit) : ""}</td></tr>)}
      <tr><td></td><td><strong>Total</strong></td><td className="acc-num"><strong>{money(tb.totalDebit)}</strong></td><td className="acc-num"><strong>{money(tb.totalCredit)}</strong></td></tr>
    </AccTable>
  );
}
