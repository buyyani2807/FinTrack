import { roundMoney } from "../../model/accountingModel.js";
import { Select } from "../../../../components/Select.jsx";
import { emptyItemLine, lastSoldRate, normalizeItemLine } from "../../model/inventoryModel.js";
import { QtyInput } from "../QtyInput.jsx";
import { UnitSelect } from "../UnitSelect.jsx";
import { formatOverviewDate, money, gstStatusLabel } from "../../accountsFormat.js";
import { Field, AccTable } from "../AccUi.jsx";
import { suggestHsn } from "../../../intelligence/ai/hsnSuggest.js";

function hsnForLine(line, items) {
  const name = items.find(item => item.id === line.itemId)?.name || line.itemName;
  const suggestion = suggestHsn(name);
  if (!suggestion) return null;
  if (String(line.hsnSac || "") === suggestion.hsn && Number(line.gstRate) === suggestion.rate) return null;
  if (line.hsnSac) return null;
  return suggestion;
}

function HsnSuggestion({ suggestion, onUse }) {
  return <p className="small">Suggested HSN {suggestion.hsn}, GST {suggestion.rate}%. {suggestion.note} <button type="button" className="btn" onClick={onUse}>Use this</button></p>;
}

function LastSoldHint({ last, onUse }) {
  if (!last) return null;
  const unit = last.unit ? ` / ${last.unit}` : "";
  const when = last.date ? ` on ${formatOverviewDate(last.date)}` : "";
  const who = last.forParty ? "this customer" : (last.partyName || "another customer");
  return (
    <p className="small">
      Last sold to {who}: {money(last.rate)}{unit}{when}.{" "}
      <button type="button" className="btn" onClick={onUse}>Use this</button>
    </p>
  );
}

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
  voucherItemLines = [],
  vouchers = [],
  parties = [],
}) {
  const lastSoldFor = line => {
    if (kind !== "sale" || !line.itemId) return null;
    const last = lastSoldRate({ itemId: line.itemId, partyId: form.partyId, voucherItemLines, vouchers });
    if (!last) return null;
    return { ...last, partyName: parties.find(party => party.id === last.partyId)?.name || "" };
  };
  const showHsn = Boolean(gstKinds);
  const columns = showHsn
    ? ["Item", "Qty", "Unit", "Rate", "Discount", "GST%", "HSN / SAC", { label: "Amount", num: true }, ""]
    : ["Item", "Qty", "Unit", "Rate", "Discount", "GST%", { label: "Amount", num: true }, ""];
  return (
    <section className="acc-form-section acc-item-lines">
      <h3 className="acc-form-section-title">Line items</h3>
      <AccTable spaced={false} columns={columns}>
        {(form.itemLines || [emptyItemLine()]).map((line, index) => {
          const lineTotals = normalizeItemLine(line);
          const stock = line.itemId ? stockByItem[line.itemId] : null;
          const suggestion = hsnForLine(line, activeItems);
          const lastSold = lastSoldFor(line);
          return (
            <tr key={index}>
              <td>
                <Select value={line.itemId || ""} onChange={event => selectItem(index, event.target.value)}>
                  <option value="">{line.itemName && !line.itemId ? `From the bill: ${line.itemName}` : "Search / select item"}</option>
                  {activeItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.sku}{item.itemType === "product" && stockByItem[item.id] != null ? ` · stock ${stockByItem[item.id]} ${item.unit}` : ""}
                    </option>
                  ))}
                </Select>
                {stock != null && <div className="small">Stock {stock} {line.unit || ""}</div>}
                {!line.itemId && line.itemName ? <div className="small">From the bill: {line.itemName}</div> : null}
                {suggestion ? <HsnSuggestion suggestion={suggestion} onUse={() => patchItemLine(index, { hsnSac: suggestion.hsn, gstRate: String(suggestion.rate) })} /> : null}
                {lastSold ? <LastSoldHint last={lastSold} onUse={() => patchItemLine(index, { rate: String(lastSold.rate), rateTouched: true })} /> : null}
              </td>
              <td><QtyInput aria-label="Quantity" value={line.quantity} onValue={quantity => patchItemLine(index, { quantity })} /></td>
              <td><UnitSelect value={line.unit} onValue={unit => patchItemLine(index, { unit })} /></td>
              <td><input type="number" min="0" step="0.01" value={line.rate} onChange={event => patchItemLine(index, { rate: event.target.value, rateTouched: true })} /></td>
              <td><input inputMode="decimal" value={line.discount || ""} placeholder="₹ or %" aria-label="Discount (amount or percent)" onChange={event => patchItemLine(index, { discount: event.target.value })} /></td>
              <td><input type="number" min="0" max="100" step="0.01" value={line.gstRate} onChange={event => patchItemLine(index, { gstRate: event.target.value })} disabled={!gstOn} /></td>
              {showHsn ? (
                <td>
                  <input
                    value={line.hsnSac || ""}
                    placeholder="optional"
                    aria-label="HSN / SAC"
                    inputMode="text"
                    autoComplete="off"
                    onChange={event => patchItemLine(index, { hsnSac: event.target.value.replace(/[^\dA-Za-z./-]/g, "").slice(0, 16) })}
                  />
                </td>
              ) : null}
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
          const lineName = activeItems.find(item => item.id === line.itemId)?.name || line.itemName || "Select item";
          const suggestion = hsnForLine(line, activeItems);
          const lastSold = lastSoldFor(line);
          return (
            <article key={index} className="acc-item-line-card">
              <div className="acc-item-line-card-top">
                <strong>{lineName}</strong>
                <span className="acc-item-line-amount">{money(lineTotals.netAmount)}</span>
              </div>
              <label className="accounts-filter-field">
                <span className="small">Item</span>
                <Select value={line.itemId || ""} onChange={event => selectItem(index, event.target.value)}>
                  <option value="">{line.itemName && !line.itemId ? `From the bill: ${line.itemName}` : "Search / select item"}</option>
                  {activeItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.sku}{item.itemType === "product" && stockByItem[item.id] != null ? ` · stock ${stockByItem[item.id]} ${item.unit}` : ""}
                    </option>
                  ))}
                </Select>
              </label>
              {stock != null && <p className="small">Stock {stock} {line.unit || ""}</p>}
              {suggestion ? <HsnSuggestion suggestion={suggestion} onUse={() => patchItemLine(index, { hsnSac: suggestion.hsn, gstRate: String(suggestion.rate) })} /> : null}
              {lastSold ? <LastSoldHint last={lastSold} onUse={() => patchItemLine(index, { rate: String(lastSold.rate), rateTouched: true })} /> : null}
              <div className="acc-item-line-card-grid">
                <label className="accounts-filter-field"><span className="small">Qty</span>
                  <QtyInput value={line.quantity} onValue={quantity => patchItemLine(index, { quantity })} />
                </label>
                <label className="accounts-filter-field"><span className="small">Unit</span>
                  <UnitSelect value={line.unit} onValue={unit => patchItemLine(index, { unit })} />
                </label>
                <label className="accounts-filter-field"><span className="small">Rate</span>
                  <input type="number" min="0" step="0.01" value={line.rate} onChange={event => patchItemLine(index, { rate: event.target.value, rateTouched: true })} />
                </label>
                <label className="accounts-filter-field"><span className="small">Discount</span>
                  <input inputMode="decimal" value={line.discount || ""} placeholder="₹ or %" onChange={event => patchItemLine(index, { discount: event.target.value })} />
                </label>
                <label className="accounts-filter-field"><span className="small">GST %</span>
                  <input type="number" min="0" max="100" step="0.01" value={line.gstRate} disabled={!gstOn} onChange={event => patchItemLine(index, { gstRate: event.target.value })} />
                </label>
                {showHsn ? (
                  <label className="accounts-filter-field"><span className="small">HSN / SAC</span>
                    <input
                      value={line.hsnSac || ""}
                      placeholder="optional"
                      inputMode="text"
                      autoComplete="off"
                      onChange={event => patchItemLine(index, { hsnSac: event.target.value.replace(/[^\dA-Za-z./-]/g, "").slice(0, 16) })}
                    />
                  </label>
                ) : null}
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
