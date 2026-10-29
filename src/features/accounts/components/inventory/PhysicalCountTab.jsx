import { todayIso } from "../../../../lib/dates.js";
import { AccPager, FilterField as Field, AccTable } from "../AccUi.jsx";
import { usePagedList } from "../../model/usePagedList.js";
import { SearchInput } from "../../../../components/ui.jsx";
import { money, qty } from "../../accountsFormat.js";
import { QtyInput } from "../QtyInput.jsx";

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
  const rows = countBook.rows.filter(matches);
  const paged = usePagedList(rows, `${countDate}|${search}`);
  return (
    <>
      <p className="copy spacer">
        Type the shelf quantity only for items you want to correct. Leave a row blank to skip it.
        <strong> Post adjustments</strong> is the save — it writes stock movements for the differences on the count date. There is no separate Save button.
      </p>
      <div className="acc-list-toolbar spacer">
        <Field label="Count date" className="acc-list-date"><input type="date" value={countDate} onChange={event => setCountDate(event.target.value || todayIso())} /></Field>
        <SearchInput label="Search items" className="acc-list-search" placeholder="Search item or SKU" value={search} onChange={event => setSearch(event.target.value)} />
        {canEdit && Object.keys(counts).length > 0 && (
          <button type="button" className="btn ghost" onClick={() => setCounts({})}>Clear counted</button>
        )}
      </div>
      <AccTable columns={["Item", { label: "Book qty", num: true }, { label: "Counted", num: true }, { label: "Difference", num: true }, { label: "Value impact", num: true }]} empty={!countBook.rows.length && "No active products to count."}>
        {paged.items.map(row => {
          const variance = variances.find(entry => entry.itemId === row.itemId);
          return <tr key={row.itemId} className={variance ? "acc-row-changed" : ""}>
            <td className="acc-cell-stack"><span>{row.name}</span>{row.sku ? <span className="small">{row.sku}</span> : null}</td>
            <td className="acc-num">{qty(row.quantity, row.unit)}</td>
            <td className="acc-num"><QtyInput className="acc-count-input" aria-label={`Counted quantity for ${row.name}`} value={counts[row.itemId] ?? ""} disabled={!canEdit} placeholder="Skip" onValue={quantity => setCounts(current => {
              if (quantity === "") {
                const next = { ...current };
                delete next[row.itemId];
                return next;
              }
              return { ...current, [row.itemId]: quantity };
            })} /></td>
            <td className={`acc-num ${variance ? (variance.quantityDelta < 0 ? "red" : "green") : ""}`}>{variance ? (variance.quantityDelta > 0 ? `+${qty(variance.quantityDelta)}` : qty(variance.quantityDelta)) : ""}</td>
            <td className="acc-num">{variance ? money(variance.valueImpact) : ""}</td>
          </tr>;
        })}
      </AccTable>
      <AccPager page={paged.page} pages={paged.pages} total={paged.total} from={paged.from} to={paged.to} onPage={paged.setPage} noun="items" />
      {countError && <p className="red small" role="alert">{countError}</p>}
      <div className={`acc-settings-savebar spacer${variances.length ? " is-dirty" : ""}`}>
        <span className="small">
          {variances.length
            ? <><b>{variances.length}</b> item{variances.length === 1 ? "" : "s"} to adjust · value impact <b>{money(variances.reduce((sum, row) => sum + row.valueImpact, 0))}</b></>
            : "No differences yet — change a Counted qty to enable posting."}
        </span>
        <button
          type="button"
          className="btn primary"
          disabled={saving || !canEdit || !variances.length}
          title={!variances.length ? "Enter a counted quantity that differs from book qty first" : undefined}
          onClick={applyCount}
        >
          {saving ? "Posting…" : "Post adjustments"}
        </button>
      </div>
    </>
  );
}
