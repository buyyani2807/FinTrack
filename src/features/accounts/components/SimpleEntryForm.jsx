import {
  MONEY_MODES,
  SIMPLE_EXPENSE_CODES,
  addDaysIso,
  moneyAccounts,
  prepareGstAmount,
  roundMoney,
  salePaymentSummary,
  cashUpiSplitIsValid,
} from "../accountingModel.js";
import { GST_RATES, gstStateFromGstin, isIntraGst } from "../accountingGst.js";
import { suggestBillWiseAllocations } from "../accountingReports.js";
import { aggregateItemizedGst, emptyItemLine, normalizeItemLine, usesItemLines } from "../inventoryModel.js";
import { money, gstStatusLabel } from "../accountsFormat.js";
import { Field } from "./AccUi.jsx";

export function SimpleEntryForm({ kind, accounts, parties, form, setForm, onSubmit, saving, maxDate, gstCompany, onGstSetup, items = [], stockByItem = {}, openInvoices = [] }) {
  const customers = parties.filter(party => party.partyType === "customer" && (party.isActive !== false || party.id === form.partyId));
  const suppliers = parties.filter(party => party.partyType === "supplier" && (party.isActive !== false || party.id === form.partyId));
  const expenseOptions = SIMPLE_EXPENSE_CODES.filter(([code]) => accounts.some(account => account.code === code) || code === "5990");
  const transferAccounts = moneyAccounts(accounts).filter(account => account.isActive !== false);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const needsParty = kind === "sale" || kind === "receipt" || kind === "credit_note" ? "customer"
    : kind === "purchase" || kind === "payment" || kind === "debit_note" ? "supplier"
    : null;
  const partyList = needsParty === "supplier" ? suppliers : customers;
  const gstKinds = kind === "sale" || kind === "purchase" || kind === "credit_note" || kind === "debit_note";
  const gstOn = gstCompany?.gstRegistration === "regular" && gstKinds;
  const selectedParty = parties.find(party => party.id === form.partyId);
  const partyState = selectedParty?.stateCode || gstStateFromGstin(selectedParty?.gstin);
  const intra = isIntraGst(gstCompany?.stateCode, partyState);
  const returnKind = kind === "credit_note" || kind === "debit_note";
  const itemMode = usesItemLines(kind, form);
  const settlementKinds = kind === "receipt" || kind === "payment" || kind === "credit_note" || kind === "debit_note";
  const partyOpenInvoices = settlementKinds && form.partyId
    ? (openInvoices || []).filter(row => row.partyId === form.partyId && Number(row.outstanding || 0) > 0)
    : [];
  const settlementTotal = roundMoney((form.settlements || []).reduce((sum, link) => sum + Number(link.amount || 0), 0));
  const syncSettlements = (partyId, amount) => {
    const open = (openInvoices || []).filter(row => row.partyId === partyId && Number(row.outstanding || 0) > 0);
    return suggestBillWiseAllocations(open, amount);
  };
  const activeItems = items.filter(item => item.isActive !== false || (form.itemLines || []).some(line => line.itemId === item.id));
  const itemPreview = itemMode
    ? aggregateItemizedGst(form.itemLines || [], { intra, taxInclusive: false })
    : null;
  const settlementAmount = itemMode
    ? Number((gstOn ? itemPreview?.total : itemPreview?.taxable) || 0)
    : form.amount;
  const gstPreview = !itemMode && gstOn
    ? prepareGstAmount(form.amount, { enabled: Number(form.gstRate) > 0, rate: form.gstRate, intra, taxInclusive: form.taxInclusive, hsnSac: form.hsnSac })
    : null;
  const invoiceTotalPreview = kind === "sale"
    ? (itemMode
      ? (gstOn ? Number(itemPreview?.total || itemPreview?.taxable || 0) : Number(itemPreview?.taxable || 0))
      : (gstOn && Number(form.gstRate) > 0 ? Number(gstPreview?.total || 0) : Number(form.amount || 0)))
    : 0;
  const amountReceivedNow = kind === "sale" && form.settlement === "credit"
    ? Number(form.amountReceived || 0)
    : kind === "sale" && form.settlement === "paid"
      ? invoiceTotalPreview
      : 0;
  const saleSummary = kind === "sale" && invoiceTotalPreview > 0
    ? (() => {
      try {
        return salePaymentSummary({
          invoiceTotal: invoiceTotalPreview,
          amountReceived: amountReceivedNow,
        });
      } catch {
        return null;
      }
    })()
    : null;
  const showReceivedOnCredit = kind === "sale" && form.settlement === "credit";
  const showMoneyMode = kind !== "transfer" && kind !== "credit_note" && kind !== "debit_note"
    && (kind === "expense" || kind === "receipt" || kind === "payment" || form.settlement === "paid"
      || (showReceivedOnCredit && Number(form.amountReceived || 0) > 0));
  const splitTargetAmount = showReceivedOnCredit
    ? Number(form.amountReceived || 0)
    : ((kind === "sale" || kind === "purchase") && form.settlement === "paid"
      ? invoiceTotalPreview
      : Number(form.amount || 0));
  const splitEntered = roundMoney(Number(form.receivedCash || 0) + Number(form.receivedUpi || 0));
  const cashUpiValid = form.moneyMode !== "cash_upi"
    || !(splitTargetAmount > 0)
    || cashUpiSplitIsValid(form.moneyMode, splitTargetAmount, {
      cash: Number(form.receivedCash || 0),
      upi: Number(form.receivedUpi || 0),
    });
  const noteCopy = kind === "credit_note"
    ? (itemMode
      ? "Sales return: returned items go back into stock, and the customer balance and sales reduce. Original invoices stay in Day Book."
      : "Reduces the customer balance and sales. Original invoices stay in Day Book.")
    : kind === "debit_note"
      ? (itemMode
        ? "Purchase return: returned items leave stock, and the supplier balance and purchases reduce. Original invoices stay in Day Book."
        : "Reduces the supplier balance and purchases. Original invoices stay in Day Book.")
      : kind === "sale"
        ? "Sale value is always the full invoice. Amount received is a separate collection against that invoice — never a reduced sale."
        : "FinTrack posts the balanced voucher for you. Open + Voucher if you need a custom journal.";

  const patchItemLine = (index, patch) => {
    setForm(current => {
      const itemLines = [...(current.itemLines || [emptyItemLine()])];
      itemLines[index] = { ...itemLines[index], ...patch };
      return { ...current, itemLines };
    });
  };

  const selectItem = (index, itemId) => {
    const item = items.find(row => row.id === itemId);
    if (!item) {
      patchItemLine(index, { itemId: "", itemName: "", itemSku: "", itemType: "product", unit: "Nos" });
      return;
    }
    const defaultRate = kind === "sale" || kind === "credit_note" ? item.sellingPrice : item.purchasePrice;
    patchItemLine(index, {
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      itemType: item.itemType,
      unit: item.unit,
      gstRate: String(item.gstRate ?? 0),
      hsnSac: item.hsnSac || "",
      rate: form.itemLines?.[index]?.rateTouched ? form.itemLines[index].rate : String(defaultRate || ""),
    });
  };

  return <>
    <p className="copy">{noteCopy}</p>
    <section className="acc-form-section">
      <h3 className="acc-form-section-title">Details</h3>
      <div className="form">
        <Field label="Date"><input type="date" max={maxDate} value={form.date} onChange={event => set({ date: event.target.value })} /></Field>
        {(kind === "sale" || kind === "purchase") && (
          <Field label="Payment">
            <select value={form.settlement} onChange={event => set({
              settlement: event.target.value,
              amountReceived: event.target.value === "paid" ? "" : form.amountReceived,
            })}>
              <option value="credit">Credit / invoice</option>
              <option value="paid">Paid in full now</option>
            </select>
          </Field>
        )}
        {showMoneyMode && (
          <Field label="Payment mode">
            <select value={form.moneyMode} onChange={event => set({ moneyMode: event.target.value, receivedCash: "", receivedUpi: "" })}>
              {MONEY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
          </Field>
        )}
        {(kind === "sale" || kind === "purchase") && form.settlement === "credit" && <Field label="Due date"><input type="date" value={form.dueDate || addDaysIso(form.date, 7)} onChange={event => set({ dueDate: event.target.value })} /></Field>}
        {kind === "expense" && <Field label="Expense"><select value={form.expenseCode} onChange={event => set({ expenseCode: event.target.value })}>{expenseOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>}
        {kind === "transfer" && <>
          <Field label="From"><select value={form.fromAccountId || ""} onChange={event => set({ fromAccountId: event.target.value })}><option value="">Select account</option>{transferAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
          <Field label="To"><select value={form.toAccountId || ""} onChange={event => set({ toAccountId: event.target.value })}><option value="">Select account</option>{transferAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
        </>}
        {needsParty && <Field label={needsParty === "supplier" ? "Supplier" : "Customer"}><select value={form.partyId} onChange={event => {
          const partyId = event.target.value;
          set({
            partyId,
            settlements: settlementKinds ? syncSettlements(partyId, settlementAmount) : form.settlements,
          });
        }}><option value="">Select</option>{partyList.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>}
        {(kind === "sale" || kind === "purchase") && (
          <Field label="Entry">
            <select value={itemMode ? "items" : "amount"} onChange={event => set({ entryMode: event.target.value })}>
              <option value="items">Line items</option>
              <option value="amount">Single amount</option>
            </select>
          </Field>
        )}
        {returnKind && (
          <Field label="Entry">
            <select value={itemMode ? "items" : "amount"} onChange={event => set({ noteEntryMode: event.target.value, settlements: [] })}>
              <option value="amount">Amount only (rate difference / discount)</option>
              <option value="items">Returned items (updates stock)</option>
            </select>
          </Field>
        )}
      </div>
    </section>

    {!itemMode && (
      <section className="acc-form-section">
        <h3 className="acc-form-section-title">{kind === "sale" ? "Invoice amount" : "Amount"}</h3>
        <div className="form">
          <Field required label={kind === "sale" ? "Sale value (invoice)" : "Amount"}><input type="number" min="0" step="0.01" value={form.amount} placeholder="0.00" onChange={event => {
            const amount = event.target.value;
            set({
              amount,
              settlements: settlementKinds ? syncSettlements(form.partyId, amount) : form.settlements,
            });
          }} /></Field>
          {showReceivedOnCredit && (
            <Field label="Amount received now">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amountReceived}
                placeholder="0.00 — leave blank if unpaid"
                onChange={event => set({ amountReceived: event.target.value })}
              />
            </Field>
          )}
          {showMoneyMode && form.moneyMode === "cash_upi" && (
            <>
              <Field label="Cash amount (₹)">
                <input type="number" min="0" step="0.01" value={form.receivedCash} placeholder="0.00" onChange={event => set({ receivedCash: event.target.value })} />
              </Field>
              <Field label="UPI amount (₹)">
                <input type="number" min="0" step="0.01" value={form.receivedUpi} placeholder="0.00" onChange={event => set({ receivedUpi: event.target.value })} />
              </Field>
              <p className={`small span ${cashUpiValid ? "" : "red"}`}>
                Cash + UPI must equal {money(splitTargetAmount)}
                {splitEntered > 0 ? ` · entered ${money(splitEntered)}` : ""}
                {!cashUpiValid && splitTargetAmount > 0 ? " · enter both amounts" : ""}
              </p>
            </>
          )}
          {!itemMode && gstKinds && gstOn && <>
            <Field label="GST rate"><select value={form.gstRate} onChange={event => set({ gstRate: event.target.value })}>{GST_RATES.map(rate => <option key={rate} value={String(rate)}>{rate}%</option>)}</select></Field>
            <Field label="Price"><select value={form.taxInclusive ? "incl" : "excl"} onChange={event => set({ taxInclusive: event.target.value === "incl" })}><option value="excl">Tax exclusive</option><option value="incl">Tax inclusive</option></select></Field>
            <Field label="HSN / SAC"><input value={form.hsnSac} placeholder="optional" onChange={event => set({ hsnSac: event.target.value })} /></Field>
            <Field label="Supply">{intra ? "Intra-state (CGST + SGST)" : partyState ? "Inter-state (IGST)" : "Set party state for CGST/SGST vs IGST"}</Field>
          </>}
          {gstKinds && !gstOn && (
            <div className="acc-gst-setup-hint span">
              <p className="copy">GST is off for {gstCompany?.name || "this company"} ({gstStatusLabel(gstCompany)}). This {kind.replaceAll("_", " ")} posts without tax until you choose Regular in Setup and save GSTIN + state.</p>
              {onGstSetup ? <button type="button" className="btn" onClick={onGstSetup}>Open GST setup</button> : null}
            </div>
          )}
          <Field className="span" label="Note (optional)"><input value={form.narration} onChange={event => set({ narration: event.target.value })} placeholder="Received from Ravi" /></Field>
        </div>
      </section>
    )}

    {itemMode && (
      <section className="acc-form-section acc-item-lines">
        <h3 className="acc-form-section-title">Line items</h3>
        <div className="table acc-table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Discount</th><th>GST%</th><th className="acc-num">Amount</th><th></th></tr></thead><tbody>
          {(form.itemLines || [emptyItemLine()]).map((line, index) => {
            const lineTotals = normalizeItemLine(line);
            const stock = line.itemId ? stockByItem[line.itemId] : null;
            return (
              <tr key={index}>
                <td>
                  <select value={line.itemId || ""} onChange={event => selectItem(index, event.target.value)}>
                    <option value="">Search / select item</option>
                    {activeItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.sku}{item.itemType === "product" && stockByItem[item.id] != null ? ` · stock ${stockByItem[item.id]} ${item.unit}` : ""}
                      </option>
                    ))}
                  </select>
                  {stock != null && <div className="small">Stock {stock} {line.unit || ""}</div>}
                </td>
                <td><input type="number" min="0" step="0.001" value={line.quantity} onChange={event => patchItemLine(index, { quantity: event.target.value })} /></td>
                <td><input type="number" min="0" step="0.01" value={line.rate} onChange={event => patchItemLine(index, { rate: event.target.value, rateTouched: true })} /></td>
                <td><input inputMode="decimal" value={line.discount || ""} placeholder="₹ or %" aria-label="Discount (amount or percent)" onChange={event => patchItemLine(index, { discount: event.target.value })} /></td>
                <td><input type="number" min="0" max="100" step="0.01" value={line.gstRate} onChange={event => patchItemLine(index, { gstRate: event.target.value })} /></td>
                <td className="acc-num">{money(lineTotals.netAmount)}</td>
                <td>{(form.itemLines || []).length > 1 && <button type="button" className="btn danger" onClick={() => setForm(current => ({ ...current, itemLines: current.itemLines.filter((_, i) => i !== index) }))}>Remove</button>}</td>
              </tr>
            );
          })}
        </tbody></table></div>
        <div className="acc-item-line-cards">
          {(form.itemLines || [emptyItemLine()]).map((line, index) => {
            const lineTotals = normalizeItemLine(line);
            const stock = line.itemId ? stockByItem[line.itemId] : null;
            const lineName = activeItems.find(item => item.id === line.itemId)?.name || "Select item";
            return (
              <article key={index} className="acc-item-line-card">
                <div className="acc-item-line-card-top">
                  <strong>{lineName}</strong>
                  <span className="acc-item-line-amount">{money(lineTotals.netAmount)}</span>
                </div>
                <label className="accounts-filter-field">
                  <span className="small">Item</span>
                  <select value={line.itemId || ""} onChange={event => selectItem(index, event.target.value)}>
                    <option value="">Search / select item</option>
                    {activeItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.sku}{item.itemType === "product" && stockByItem[item.id] != null ? ` · stock ${stockByItem[item.id]} ${item.unit}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {stock != null && <p className="small">Stock {stock} {line.unit || ""}</p>}
                <div className="acc-item-line-card-grid">
                  <label className="accounts-filter-field"><span className="small">Qty</span>
                    <input type="number" min="0" step="0.001" value={line.quantity} onChange={event => patchItemLine(index, { quantity: event.target.value })} />
                  </label>
                  <label className="accounts-filter-field"><span className="small">Rate</span>
                    <input type="number" min="0" step="0.01" value={line.rate} onChange={event => patchItemLine(index, { rate: event.target.value, rateTouched: true })} />
                  </label>
                  <label className="accounts-filter-field"><span className="small">Discount</span>
                    <input inputMode="decimal" value={line.discount || ""} placeholder="₹ or %" onChange={event => patchItemLine(index, { discount: event.target.value })} />
                  </label>
                  <label className="accounts-filter-field"><span className="small">GST %</span>
                    <input type="number" min="0" max="100" step="0.01" value={line.gstRate} onChange={event => patchItemLine(index, { gstRate: event.target.value })} />
                  </label>
                </div>
                {(form.itemLines || []).length > 1 && (
                  <button type="button" className="btn danger" onClick={() => setForm(current => ({ ...current, itemLines: current.itemLines.filter((_, i) => i !== index) }))}>Remove</button>
                )}
              </article>
            );
          })}
        </div>
        <button type="button" className="btn" onClick={() => setForm(current => ({ ...current, itemLines: [...(current.itemLines || []), emptyItemLine()] }))}>+ Add item</button>
        {itemPreview && (
          <p className="small acc-gst-preview">
            {(() => {
              const discountTotal = roundMoney(itemPreview.lines.reduce((sum, line) => sum + (Number.isFinite(line.discountAmount) ? line.discountAmount : 0), 0));
              return discountTotal > 0 ? `Discount ${money(discountTotal)} · ` : "";
            })()}
            Subtotal {money(itemPreview.taxable)}
            {gstOn && itemPreview.tax > 0 ? (itemPreview.igst > 0
              ? ` · IGST ${money(itemPreview.igst)}`
              : ` · CGST ${money(itemPreview.cgst)} · SGST ${money(itemPreview.sgst)}`) : ""}
            {` · Total ${money(gstOn ? itemPreview.total : itemPreview.taxable)}`}
          </p>
        )}
        {showReceivedOnCredit && (
          <div className="form spacer">
            <Field label="Amount received now">
              <input type="number" min="0" step="0.01" value={form.amountReceived} placeholder="0.00 — leave blank if unpaid" onChange={event => set({ amountReceived: event.target.value })} />
            </Field>
          </div>
        )}
        {showMoneyMode && form.moneyMode === "cash_upi" && (
          <div className="form spacer">
            <Field label="Cash amount (₹)">
              <input type="number" min="0" step="0.01" value={form.receivedCash} placeholder="0.00" onChange={event => set({ receivedCash: event.target.value })} />
            </Field>
            <Field label="UPI amount (₹)">
              <input type="number" min="0" step="0.01" value={form.receivedUpi} placeholder="0.00" onChange={event => set({ receivedUpi: event.target.value })} />
            </Field>
            <p className={`small span ${cashUpiValid ? "" : "red"}`}>
              Cash + UPI must equal {money(splitTargetAmount)}
              {splitEntered > 0 ? ` · entered ${money(splitEntered)}` : ""}
              {!cashUpiValid && splitTargetAmount > 0 ? " · enter both amounts" : ""}
            </p>
          </div>
        )}
        {gstKinds && !gstOn && (
          <div className="acc-gst-setup-hint">
            <p className="copy">GST is off for {gstCompany?.name || "this company"} ({gstStatusLabel(gstCompany)}). This {kind.replaceAll("_", " ")} posts without tax until you choose Regular in Setup and save GSTIN + state.</p>
            {onGstSetup ? <button type="button" className="btn" onClick={onGstSetup}>Open GST setup</button> : null}
          </div>
        )}
        <div className="form">
          <Field className="span" label="Note (optional)"><input value={form.narration} onChange={event => set({ narration: event.target.value })} placeholder="Received from Ravi" /></Field>
        </div>
      </section>
    )}

    {gstPreview && Number(form.amount) > 0 && Number(form.gstRate) > 0 && (
      <p className="small acc-gst-preview">
        Taxable {money(gstPreview.taxable)}
        {gstPreview.supplyType === "intra" ? ` · CGST ${money(gstPreview.cgst)} · SGST ${money(gstPreview.sgst)}` : ` · IGST ${money(gstPreview.igst)}`}
        {` · Total ${money(gstPreview.total)}`}
      </p>
    )}

    {saleSummary && (
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
    )}

    {settlementKinds && form.partyId && (
      <div className="acc-billwise spacer acc-form-section">
        <h3 className="acc-form-section-title">Allocate against invoices</h3>
        <p className="small">Bill-wise links are saved with this voucher. Suggested oldest-first; edit amounts as needed. Unallocated remainder still reduces party balance.</p>
        {partyOpenInvoices.length ? (
          <div className="table acc-table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th className="acc-num">Outstanding</th><th className="acc-num">Allocate</th></tr></thead><tbody>
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
          </tbody></table></div>
        ) : <p className="small">No open invoices for this party — receipt/payment will still post to the party ledger.</p>}
        <p className={`small ${settlementTotal > Number(form.amount || 0) + 0.001 ? "red" : ""}`}>
          Allocated {money(settlementTotal)} of {money(form.amount || 0)}
          {settlementTotal > Number(form.amount || 0) + 0.001 ? " · reduce allocations to match the amount" : ""}
        </p>
        <button type="button" className="btn" onClick={() => set({ settlements: syncSettlements(form.partyId, form.amount) })}>Auto-allocate oldest first</button>
      </div>
    )}

    <div className="tabs spacer"><button type="button" className="btn primary" disabled={saving || (settlementKinds && settlementTotal > Number(form.amount || 0) + 0.001) || (saleSummary && saleSummary.amountReceived > saleSummary.invoiceTotal + 0.001) || (showMoneyMode && form.moneyMode === "cash_upi" && splitTargetAmount > 0 && !cashUpiValid)} onClick={onSubmit}>{saving ? "Saving…" : "Save"}</button></div>
  </>;
}
