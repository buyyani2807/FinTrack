import { money } from "../../accountsFormat.js";

export function SaleSummaryCard({ saleSummary, form }) {
  return (
    <div className="card acc-sale-summary spacer" aria-label="Sale summary">
      <h3 className="acc-section-title">Sale summary</h3>
      <p className="small">Sale value is the full invoice recorded in the books. Amount received is money collected against that invoice.</p>
      <dl className="acc-sale-summary-grid">
        <div><dt>Invoice total (sale value)</dt><dd>{money(saleSummary.invoiceTotal)}</dd></div>
        <div><dt>Amount received</dt><dd>{money(saleSummary.amountReceived)}</dd></div>
        <div><dt>Outstanding receivable</dt><dd className={saleSummary.outstanding > 0 ? "due" : "ok"}>{money(saleSummary.outstanding)}</dd></div>
        <div><dt>Payment status</dt><dd><span className={`acc-status-pill ${saleSummary.paymentStatus === "Paid" ? "inv-paid" : saleSummary.paymentStatus === "Partially Paid" ? "inv-partial" : "inv-current"}`}>{saleSummary.paymentStatus}</span></dd></div>
      </dl>
      {form.settlement === "credit" && saleSummary.amountReceived > saleSummary.invoiceTotal + 0.001 ? (
        <p className="small red" role="alert">Amount received cannot exceed the invoice total.</p>
      ) : null}
    </div>
  );
}
