import { downloadAccountsCsv } from "../../io/accountingExport.js";
import { ITEM_CSV_TEMPLATE } from "../../io/itemCsvImport.js";
import { AccTable } from "../AccUi.jsx";

export function ItemImportTab({ canEdit, saving, readImportFile, importPlan, setImportPlan, runImport, importStatus }) {
  return (
    <>
      <p className="copy spacer">
        Import a product list from FinTrack’s template or from another POS (Focus, Vyapar, Marg, Excel export, etc.).
        Name is required. SKU is preferred; if missing, barcode is used, otherwise a code is generated from the name.
        Prices, GST, HSN, unit, category, barcode, brand and stock columns are matched by common header names.
        Existing SKUs are skipped.
      </p>
      <div className="accounts-action-row spacer">
        <button type="button" className="btn" onClick={() => downloadAccountsCsv("fintrack-items-template.csv", ITEM_CSV_TEMPLATE.split("\n").map(line => line.split(",")))}>Download template</button>
        <label className={`btn primary ${!canEdit ? "disabled" : ""}`.trim()}>
          Choose CSV / Excel
          <input type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden disabled={!canEdit || saving} onChange={readImportFile} />
        </label>
      </div>
      {importPlan && <div className="card spacer">
        <strong>{importPlan.toCreate.length} new item{importPlan.toCreate.length === 1 ? "" : "s"} ready</strong>
        <p className="small">{importPlan.duplicates.length} existing SKU{importPlan.duplicates.length === 1 ? "" : "s"} skipped · {importPlan.invalid.length} row{importPlan.invalid.length === 1 ? "" : "s"} with errors</p>
        {importPlan.invalid.length > 0 && <ul className="small">
          {importPlan.invalid.slice(0, 8).map(row => <li key={row.rowNumber}>Row {row.rowNumber}: {row.error}</li>)}
        </ul>}
        {importPlan.toCreate.length > 0 && <AccTable columns={["Name", "SKU", "Type", "Unit", { label: "Opening", num: true }, { label: "Rate", num: true }]}>
          {importPlan.toCreate.slice(0, 20).map(row => <tr key={row.rowNumber}><td>{row.name}</td><td>{row.sku}</td><td>{row.itemType}</td><td>{row.unit}</td><td className="acc-num">{row.openingStock}</td><td className="acc-num">{row.openingRate || row.purchasePrice}</td></tr>)}
        </AccTable>}
        <div className="tabs spacer">
          <button type="button" className="btn" onClick={() => setImportPlan(null)}>Cancel</button>
          <button type="button" className="btn primary" disabled={saving || !importPlan.toCreate.length} onClick={runImport}>{saving ? "Importing…" : `Import ${importPlan.toCreate.length}`}</button>
        </div>
      </div>}
      {importStatus && <p className="small spacer">{importStatus}</p>}
    </>
  );
}
