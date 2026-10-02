import { todayIso } from "../../../../lib/dates.js";
import { FilterField as Field, AccTable } from "../AccUi.jsx";
import { money, qty } from "../../accountsFormat.js";

export function PhysicalCountTab({
  countDate,
  setCountDate,
  search,
  setSearch,
  countBook,
  matches,
  variances,
  counts,
  canEdit,
  setCounts,
  countError,
  saving,
  applyCount,
}) {
  return (
    <>
      <p className="copy spacer">Enter what you counted on the shelf. Leave a row blank to skip it. Differences are posted as stock adjustments dated on the count date.</p>
      <div className="accounts-action-row spacer">
        <Field label="Count date"><input type="date" value={countDate} onChange={event => setCountDate(event.target.value || todayIso())} /></Field>
        <input className="accounts-search" placeholder="Search item or SKU" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <AccTable columns={["Item", { label: "Book qty", num: true }, { label: "Counted", num: true }, { label: "Difference", num: true }, { label: "Value impact", num: true }]} empty={!countBook.rows.length && "No active products to count."}>
        {countBook.rows.filter(matches).map(row => {
          const variance = variances.find(entry => entry.itemId === row.itemId);
          return <tr key={row.itemId}>
            <td>{row.name} <span className="small">{row.sku}</span></td>
            <td className="acc-num">{qty(row.quantity, row.unit)}</td>
            <td className="acc-num"><input type="number" min="0" step="0.001" className="acc-count-input" aria-label={`Counted quantity for ${row.name}`} value={counts[row.itemId] ?? ""} disabled={!canEdit} onChange={event => setCounts(current => ({ ...current, [row.itemId]: event.target.value }))} /></td>
            <td className={`acc-num ${variance ? (variance.quantityDelta < 0 ? "red" : "green") : ""}`}>{variance ? (variance.quantityDelta > 0 ? `+${qty(variance.quantityDelta)}` : qty(variance.quantityDelta)) : ""}</td>
            <td className="acc-num">{variance ? money(variance.valueImpact) : ""}</td>
          </tr>;
        })}
      </AccTable>
      {countError && <p className="red small">{countError}</p>}
      <div className="accounts-action-row spacer">
        <p className="small">{variances.length} item{variances.length === 1 ? "" : "s"} to adjust · value impact {money(variances.reduce((sum, row) => sum + row.valueImpact, 0))}</p>
        <button type="button" className="btn primary" disabled={saving || !canEdit || !variances.length} onClick={applyCount}>{saving ? "Posting…" : "Post adjustments"}</button>
      </div>
    </>
  );
}
