import { roundMoney } from "../../model/accountingModel.js";
import { emptyItemLine, normalizeItemLine } from "../../model/inventoryModel.js";
import { money, gstStatusLabel } from "../../accountsFormat.js";
import { Field, AccTable } from "../AccUi.jsx";

export function ItemLinesSection({
  form,
  stockByItem,
  selectItem,
  activeItems,
  patchItemLine,
  setForm,
  itemPreview,
  gstOn,
  showReceivedOnCredit,
  set,
  showMoneyMode,
  cashUpiValid,
  splitTargetAmount,
  splitEntered,
  gstKinds,
  gstCompany,
  kind,
  onGstSetup,
}) {
  return (
    <section className="acc-form-section acc-item-lines">
      <h3 className="acc-form-section-title">Line items</h3>
      <AccTable spaced={false} columns={["Item", "Qty", "Rate", "Discount", "GST%", { label: "Amount", num: true }, ""]}>
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
      </AccTable>
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
  );
}
