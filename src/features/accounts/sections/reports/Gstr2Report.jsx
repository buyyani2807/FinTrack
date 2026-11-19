import { useMemo, useState } from "react";
import { AccMetric, AccPager, AccTable } from "../../components/AccUi.jsx";
import { SegmentedControl } from "../../../../components/ui.jsx";
import { money } from "../../accountsFormat.js";
import { pageSlice } from "../../model/accountsList.js";
import { buildGstr2Report, GSTR2_SECTIONS } from "../../model/gstr2Report.js";

const SECTION_COLUMNS = [
  "Date",
  "Supplier",
  "GSTIN",
  "Bill no.",
  "Supply",
  { label: "Rate", num: true },
  { label: "Taxable", num: true },
  { label: "IGST", num: true },
  { label: "CGST", num: true },
  { label: "SGST", num: true },
  { label: "ITC", num: true },
];

/** GSTR-2 (Purchases): invoice-wise inward supplies by GSTR-2 table, with HSN and checks. */
export function Gstr2Report({ vouchers, parties, range, activeCompany, onViewDocument }) {
  const report = useMemo(
    () => buildGstr2Report({ vouchers, parties, range, companyStateCode: activeCompany?.stateCode || "" }),
    [vouchers, parties, range, activeCompany?.stateCode],
  );
  const [sectionId, setSectionId] = useState("b2b");
  const [page, setPage] = useState(1);
  const rows = report.sections[sectionId] || [];
  const paged = pageSlice(rows, page);
  const totals = report.totals[sectionId];
  const notes = report.totals.cdnr.tax + report.totals.cdnur.tax;

  return (
    <div className="acc-gst-reports acc-gstr2">
      <p className="copy">Purchases and purchase returns for the selected dates, arranged like the GSTR-2 tables. Use it to check suppliers, bill numbers and Input Tax Credit before matching with GSTR-2B. <strong>Calculated</strong> from your books — not a filed return.</p>
      <div className="acc-metric-grid">
        <AccMetric label="Purchases (taxable)" value={money(report.totals.b2b.taxable + report.totals.b2bur.taxable + report.totals.nil.taxable)} />
        <AccMetric label="ITC available" value={money(report.summary.itcAvailable)} />
        <AccMetric label="ITC not eligible" value={money(report.summary.itcIneligible)} tone={report.summary.itcIneligible > 0 ? "due" : ""} />
        <AccMetric label="Debit notes (tax)" value={money(notes)} />
      </div>

      {report.checks.length > 0 && (
        <div className="notice spacer" role="status">
          <strong>{report.checks.length} {report.checks.length === 1 ? "purchase needs" : "purchases need"} a look before GSTR-2B matching</strong>
          <ul className="acc-gstr2-checks">
            {report.checks.slice(0, 8).map((check, index) => <li key={`${check.voucherNumber}-${index}`}>{check.voucherNumber} ({check.date}): {check.issue}</li>)}
          </ul>
          {report.checks.length > 8 && <span className="small">All {report.checks.length} are listed in the Excel / CSV export.</span>}
        </div>
      )}

      <h3 className="acc-section-title">Summary by table</h3>
      <AccTable spaced={false} columns={["Table", { label: "Bills", num: true }, { label: "Taxable", num: true }, { label: "IGST", num: true }, { label: "CGST", num: true }, { label: "SGST", num: true }, { label: "ITC", num: true }]}>
        {GSTR2_SECTIONS.map(section => {
          const t = report.totals[section.id];
          return <tr key={section.id}>
            <td>{section.label} <span className="small">({section.table})</span></td>
            <td className="acc-num">{t.invoices}</td>
            <td className="acc-num">{money(t.taxable)}</td>
            <td className="acc-num">{money(t.igst)}</td>
            <td className="acc-num">{money(t.cgst)}</td>
            <td className="acc-num">{money(t.sgst)}</td>
            <td className="acc-num">{money(t.itc)}</td>
          </tr>;
        })}
        <tr className="acc-stmt-total">
          <td><strong>Net inward</strong> <span className="small">(purchases − debit notes)</span></td>
          <td className="acc-num">{report.summary.invoices}</td>
          <td className="acc-num"><strong>{money(report.summary.taxable)}</strong></td>
          <td className="acc-num">{money(report.summary.igst)}</td>
          <td className="acc-num">{money(report.summary.cgst)}</td>
          <td className="acc-num">{money(report.summary.sgst)}</td>
          <td className="acc-num"><strong>{money(report.summary.itcAvailable)}</strong></td>
        </tr>
      </AccTable>

      <h3 className="acc-section-title">Bills</h3>
      <SegmentedControl
        label="GSTR-2 table"
        value={sectionId}
        onChange={id => { setSectionId(id); setPage(1); }}
        options={GSTR2_SECTIONS.map(section => ({ id: section.id, label: `${section.label} · ${report.totals[section.id].invoices}` }))}
      />
      <AccTable spaced={false} columns={SECTION_COLUMNS} empty={!rows.length && "Nothing in this table for the selected dates."}>
        {paged.items.map((row, index) => (
          <tr key={`${row.voucherId || row.voucherNumber}-${row.rate}-${index}`}>
            <td>{row.date}</td>
            <td>
              {onViewDocument && row.voucherId
                ? <button type="button" className="link-button" onClick={() => onViewDocument(row)}>{row.supplierName || "—"}</button>
                : row.supplierName || "—"}
              {row.reversalOf && <span className="small"> · reversal</span>}
            </td>
            <td>{row.gstin || "—"}</td>
            <td>{row.billNumberMissing ? <span className="small" title="No supplier bill number in the narration">{row.voucherNumber}*</span> : row.invoiceNumber}</td>
            <td>{row.supplyType === "Inter-state" ? "Inter" : "Intra"}</td>
            <td className="acc-num">{row.rate}%</td>
            <td className="acc-num">{money(row.taxable)}</td>
            <td className="acc-num">{money(row.igst)}</td>
            <td className="acc-num">{money(row.cgst)}</td>
            <td className="acc-num">{money(row.sgst)}</td>
            <td className="acc-num">{money(row.itcTotal)}</td>
          </tr>
        ))}
        {rows.length > 0 && <tr className="acc-stmt-total">
          <td colSpan={6}><strong>Total</strong></td>
          <td className="acc-num"><strong>{money(totals.taxable)}</strong></td>
          <td className="acc-num">{money(totals.igst)}</td>
          <td className="acc-num">{money(totals.cgst)}</td>
          <td className="acc-num">{money(totals.sgst)}</td>
          <td className="acc-num"><strong>{money(totals.itc)}</strong></td>
        </tr>}
      </AccTable>
      <AccPager page={paged.page} pages={paged.pages} total={paged.total} onPage={setPage} noun="bill lines" />
      {rows.some(row => row.billNumberMissing) && <p className="small">* Our voucher number is shown where the supplier bill number is missing.</p>}

      <h3 className="acc-section-title">HSN summary of inward supplies (table 13)</h3>
      <AccTable spaced={false} columns={["HSN / SAC", { label: "Taxable", num: true }, { label: "IGST", num: true }, { label: "CGST", num: true }, { label: "SGST", num: true }, { label: "Total tax", num: true }]} empty={!report.hsn.length && "No purchase GST lines in this period."}>
        {report.hsn.map(row => <tr key={row.hsnSac}><td>{row.hsnSac}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.igst)}</td><td className="acc-num">{money(row.cgst)}</td><td className="acc-num">{money(row.sgst)}</td><td className="acc-num">{money(row.tax)}</td></tr>)}
      </AccTable>
    </div>
  );
}
