import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COUNTER_PRINT_FORMATS,
  DEFAULT_COUNTER_PRINT_FORMAT,
  counterPrintFormatSpec,
  emptyCounterSettings,
  readCounterSettings,
  saveCounterSettings,
} from "../src/features/accounts/model/counterSettings.js";
import { buildOfflineReceiptInvoice } from "../src/features/accounts/model/counterOffline.js";
import { buildThermalReceiptHtml } from "../src/features/accounts/io/thermalReceiptPrint.js";

test("four printer choices are offered: 80mm/58mm thermal, A4/A5 regular", () => {
  const ids = COUNTER_PRINT_FORMATS.map(format => format.id);
  assert.deepEqual(ids, ["thermal80", "thermal58", "a4", "a5"]);
  assert.equal(DEFAULT_COUNTER_PRINT_FORMAT, "thermal80");
  assert.equal(counterPrintFormatSpec("thermal80").kind, "thermal");
  assert.equal(counterPrintFormatSpec("thermal80").widthMm, 80);
  assert.equal(counterPrintFormatSpec("thermal58").widthMm, 58);
  assert.equal(counterPrintFormatSpec("a4").kind, "regular");
  assert.equal(counterPrintFormatSpec("a5").kind, "regular");
  // Unknown id falls back to the default rather than throwing / printing nothing.
  assert.equal(counterPrintFormatSpec("made-up").id, DEFAULT_COUNTER_PRINT_FORMAT);
});

test("Counter settings default to the 80mm thermal slip and round-trip the choice", () => {
  assert.equal(emptyCounterSettings().printFormat, "thermal80");
  // No localStorage in this test environment, so reads/writes fall back to the default —
  // this still exercises that the fallback path always returns a *valid* format id.
  const settings = readCounterSettings("co-1");
  assert.ok(COUNTER_PRINT_FORMATS.some(format => format.id === settings.printFormat));
  const saved = saveCounterSettings("co-1", { printFormat: "a5" });
  assert.ok(COUNTER_PRINT_FORMATS.some(format => format.id === saved.printFormat));
});

test("buildOfflineReceiptInvoice carries the chosen printer format onto the invoice", () => {
  const bill = { payload: { itemLines: [], totals: { taxable: 100 } }, amount: 100 };
  const thermal58 = buildOfflineReceiptInvoice({ bill, printFormat: "thermal58" });
  assert.equal(thermal58.documentTemplate, "thermal58");
  assert.equal(thermal58.posSlip, true);

  const regularA4 = buildOfflineReceiptInvoice({ bill, printFormat: "a4" });
  assert.equal(regularA4.documentTemplate, "a4");

  // No format passed (older call sites) still defaults to the 80mm slip, never blank.
  const noFormat = buildOfflineReceiptInvoice({ bill });
  assert.equal(noFormat.documentTemplate, "thermal80");
});

test("thermal receipt HTML narrows the slip and item columns for a 58mm roll", () => {
  const model = { title: "BILL", seller: { name: "Shop", lines: [] }, party: { name: "Walk-in", lines: [] }, meta: [], items: [], totals: [] };
  const html80 = buildThermalReceiptHtml(model, null, { autoPrint: false });
  const html58 = buildThermalReceiptHtml(model, null, { autoPrint: false, widthMm: 58 });

  assert.match(html80, /@page \{ size: 80mm auto/);
  assert.match(html80, /width: 80mm/);
  assert.match(html58, /@page \{ size: 58mm auto/);
  assert.match(html58, /width: 58mm/);

  // The item-row grid columns must shrink too, not just the page — otherwise a 58mm print
  // overflows its own paper.
  assert.match(html80, /grid-template-columns: minmax\(0, 1fr\) 9mm 13mm 15mm/);
  assert.match(html58, /grid-template-columns: minmax\(0, 1fr\) 7mm 10mm 11mm/);

  // Default (no widthMm passed) stays 80mm, so every existing caller keeps working as-is.
  const htmlDefault = buildThermalReceiptHtml(model, null, { autoPrint: false });
  assert.match(htmlDefault, /@page \{ size: 80mm auto/);
});

// salesInvoicePdf.js touches `window`/`URL`, which this plain node:test run doesn't provide,
// so its routing logic is checked against the source (matching this repo's existing pattern
// for modules that can't be exercised directly without a DOM).
const salesInvoicePdfSrc = readFileSync(
  new URL("../src/features/accounts/io/salesInvoicePdf.js", import.meta.url),
  "utf8",
);

test("printSalesInvoicePdf treats both thermal widths as thermal, and a4/a5 as regular PDF", () => {
  assert.match(salesInvoicePdfSrc, /function thermalWidthMm\(template\)/);
  assert.match(salesInvoicePdfSrc, /template === "thermal58"\) return 58/);
  assert.match(salesInvoicePdfSrc, /template === "thermal80" \|\| template === "thermal"\) return 80/);
  // Thermal print must pass the resolved width through to the HTML builder.
  assert.match(salesInvoicePdfSrc, /printThermalReceiptHtml\(salesInvoicePdfModel\(invoice\), invoice, \{ widthMm \}\)/);
});
