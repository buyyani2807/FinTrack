import { roundMoney } from "../../model/accountingModel.js";
import { money } from "../../accountsFormat.js";
import { AccTable } from "../AccUi.jsx";

export function BillwiseSettlement({ partyOpenInvoices, form, setForm, settlementTotal, set, syncSettlements }) {
  return (
    <div className="acc-billwise spacer acc-form-section">
      <h3 className="acc-form-section-title">Allocate against invoices</h3>
      <p className="small">Bill-wise links are saved with this voucher. Suggested oldest-first; edit amounts as needed. Unallocated remainder still reduces party balance.</p>
      {partyOpenInvoices.length ? (
        <AccTable spaced={false} columns={["Invoice", "Date", { label: "Outstanding", num: true }, { label: "Allocate", num: true }]}>
          {partyOpenInvoices.map(invoice => {
            const link = (form.settlements || []).find(row => row.invoiceVoucherId === invoice.id);
            return (
              <tr key={invoice.id}>
                <td>{invoice.reference}</td>
                <td>{invoice.invoiceDate}</td>
                <td className="acc-num">{money(invoice.outstanding)}</td>
                <td className="acc-num">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={link ? String(link.amount) : ""}
                    placeholder="0"
                    onChange={event => {
                      const value = Number(event.target.value || 0);
                      setForm(current => {
                        const rest = (current.settlements || []).filter(row => row.invoiceVoucherId !== invoice.id);
                        if (!(value > 0)) return { ...current, settlements: rest };
                        return {
                          ...current,
                          settlements: [...rest, {
                            invoiceVoucherId: invoice.id,
                            reference: invoice.reference,
                            amount: roundMoney(Math.min(value, invoice.outstanding)),
                          }],
                        };
                      });
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </AccTable>
      ) : <p className="small">No open invoices for this party — receipt/payment will still post to the party ledger.</p>}
      <p className={`small ${settlementTotal > Number(form.amount || 0) + 0.001 ? "red" : ""}`}>
        Allocated {money(settlementTotal)} of {money(form.amount || 0)}
        {settlementTotal > Number(form.amount || 0) + 0.001 ? " · reduce allocations to match the amount" : ""}
      </p>
      <button type="button" className="btn" onClick={() => set({ settlements: syncSettlements(form.partyId, form.amount) })}>Auto-allocate oldest first</button>
    </div>
  );
}
