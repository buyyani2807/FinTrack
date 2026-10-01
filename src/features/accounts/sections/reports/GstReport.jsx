import { AccMetric, AccPager } from "../../components/AccUi.jsx";
import {
  buildGstr1Preparation,
  buildGstr3bPreparation,
  EINVOICE_INTEGRATION_STUB,
  gstrPrepToCsvRows,
  gstrPrepToJson,
} from "../../io/gstPrepExport.js";
import { trackProductEvent } from "../../../commercial/productAnalytics.js";
import { todayIso } from "../../../../lib/dates.js";
import { downloadAccountsCsv } from "../../io/accountingExport.js";
import { money } from "../../accountsFormat.js";

export function GstReport({ vouchers, parties, range, setNotice, gstReport, pagedGstOutput, setListPage }) {
  return (
    <div className="acc-gst-reports">
      <p className="copy">GST figures are from this company’s books for the selected dates. They are <strong>calculated</strong> data — not a filed GSTR-1 or GSTR-3B.</p>
      <div className="accounts-action-row spacer">
        <button type="button" className="btn" onClick={() => {
          const prep = buildGstr1Preparation({ vouchers, parties, range });
          downloadAccountsCsv(`fintrack-gstr1-prep-${todayIso()}.csv`, gstrPrepToCsvRows(prep));
          trackProductEvent("gstr1_prep_export");
          setNotice("GSTR-1 preparation CSV downloaded (calculated / not filed).");
        }}>Export GSTR-1 prep CSV</button>
        <button type="button" className="btn" onClick={() => {
          const prep = buildGstr1Preparation({ vouchers, parties, range });
          const blob = new Blob([JSON.stringify(gstrPrepToJson(prep), null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `fintrack-gstr1-prep-${todayIso()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          trackProductEvent("gstr1_prep_json_export");
          setNotice("GSTR-1 preparation JSON downloaded (calculated / not filed).");
        }}>Export GSTR-1 prep JSON</button>
        <button type="button" className="btn" onClick={() => {
          const prep = buildGstr3bPreparation({ vouchers, range });
          downloadAccountsCsv(`fintrack-gstr3b-prep-${todayIso()}.csv`, gstrPrepToCsvRows(prep));
          trackProductEvent("gstr3b_prep_export");
          setNotice("GSTR-3B preparation CSV downloaded (calculated / not filed).");
        }}>Export GSTR-3B prep CSV</button>
        <button type="button" className="btn" onClick={() => {
          const prep = buildGstr3bPreparation({ vouchers, range });
          const blob = new Blob([JSON.stringify(gstrPrepToJson(prep), null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `fintrack-gstr3b-prep-${todayIso()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          trackProductEvent("gstr3b_prep_json_export");
          setNotice("GSTR-3B preparation JSON downloaded (calculated / not filed).");
        }}>Export GSTR-3B prep JSON</button>
      </div>
      <div className="notice spacer">
        <strong>e-Invoice / e-Way:</strong> {EINVOICE_INTEGRATION_STUB.note} Queue a payload from a posted sales voucher — FinTrack will not invent IRNs or call the portal.
      </div>
      <div className="acc-metric-grid three">
        <AccMetric label="Output GST" value={money(gstReport.outputTax)} />
        <AccMetric label="Eligible ITC" value={money(gstReport.inputTax)} />
        <AccMetric label="Net GST payable" value={money(gstReport.netPayable)} tone={gstReport.netPayable > 0 ? "due" : ""} />
      </div>
      <h3 className="acc-section-title">Tax-rate summary</h3>
      <div className="table acc-table-wrap"><table><thead><tr><th>Rate</th><th className="acc-num">Taxable</th><th className="acc-num">CGST</th><th className="acc-num">SGST</th><th className="acc-num">IGST</th></tr></thead><tbody>
        {gstReport.byRate.map(row => <tr key={row.rate}><td>{row.rate}%</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst)}</td><td className="acc-num">{money(row.sgst)}</td><td className="acc-num">{money(row.igst)}</td></tr>)}
        {!gstReport.byRate.length && <tr><td colSpan="5">No GST lines in this period.</td></tr>}
      </tbody></table></div>
      <h3 className="acc-section-title">HSN / SAC</h3>
      <div className="table acc-table-wrap"><table><thead><tr><th>HSN / SAC</th><th className="acc-num">Taxable</th><th className="acc-num">CGST</th><th className="acc-num">SGST</th><th className="acc-num">IGST</th></tr></thead><tbody>
        {gstReport.byHsn.map(row => <tr key={row.hsnSac}><td>{row.hsnSac}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst)}</td><td className="acc-num">{money(row.sgst)}</td><td className="acc-num">{money(row.igst)}</td></tr>)}
        {!gstReport.byHsn.length && <tr><td colSpan="5">No HSN/SAC lines in this period.</td></tr>}
      </tbody></table></div>
      <h3 className="acc-section-title">Output GST</h3>
      <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>HSN</th><th className="acc-num">Taxable</th><th className="acc-num">Tax</th></tr></thead><tbody>
        {pagedGstOutput.items.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.hsnSac || "—"}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.cgst + row.sgst + row.igst)}</td></tr>)}
        {!gstReport.output.length && <tr><td colSpan="5">No output GST in this period.</td></tr>}
      </tbody></table></div>
      <AccPager page={pagedGstOutput.page} pages={pagedGstOutput.pages} total={pagedGstOutput.total} onPage={setListPage} noun="output lines" />
      <h3 className="acc-section-title">Input GST / ITC</h3>
      <div className="table acc-table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>HSN</th><th className="acc-num">Taxable</th><th className="acc-num">ITC</th></tr></thead><tbody>
        {gstReport.input.map((row, index) => <tr key={`${row.voucherNumber}-${index}`}><td>{row.date}</td><td>{row.voucherNumber}</td><td>{row.hsnSac || "—"}</td><td className="acc-num">{money(row.taxable)}</td><td className="acc-num">{money(row.itcEligible ? row.cgst + row.sgst + row.igst : 0)}</td></tr>)}
        {!gstReport.input.length && <tr><td colSpan="5">No input GST in this period.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
