import fs from "node:fs";
import { buildSalesInvoice } from "../../src/features/accounts/salesInvoiceModel.js";
import { renderSalesInvoicePdf } from "../../src/features/accounts/salesInvoicePdf.js";
const logo = "data:image/jpeg;base64," + fs.readFileSync(".tmp/pdfcheck/logo.jpg").toString("base64");
const accounts = [{ id: "ar", accountType: "receivable" }, { id: "s", accountType: "income" }];
const items = Array.from({ length: Number(process.argv[2] || 6) }, (_, i) => ({ itemName: `Steel rod TMT 12mm Fe500D grade bundle number ${i + 1}`, itemSku: `TMT-${i}`, quantity: 2 + i, unit: "Nos", rate: 1250.5, discountAmount: i % 2 ? 100 : 0, taxableAmount: (2 + i) * 1250.5, gstRate: 18, hsnSac: "7214" }));
const invoice = buildSalesInvoice({
  voucher: { id: "v", voucherNumber: "SALE-000042", date: "2026-09-20", dueDate: "2026-10-05", status: "posted", partyId: "p", narration: "Site delivery to Kukatpally", lines: [{ coaId: "ar", debit: 11800 }, { coaId: "s", credit: 10000 }], gstLines: [{ taxable: 10000, cgst: 900, sgst: 900, igst: 0, rate: 18 }] },
  party: { name: "Initial Coatings Pvt Ltd", phone: "9848626699", gstin: "36AAACL9861H1Z7", address: "Plot 12, IDA Balanagar, Hyderabad 500037" },
  accounts,
  company: { name: "SRIHITHA INFRA", gstin: "36AAAAA0000A1Z5", stateName: "Telangana", stateCode: "36", documentSettings: { businessAddress: "4-1-22, Ameerpet, Hyderabad", businessPhone: "9000000000", businessEmail: "accounts@srihitha.in", logoDataUrl: logo, upiId: "srihitha@okaxis", bankName: "HDFC Bank", bankAccountNumber: "50100012345678", bankIfsc: "hdfc0001234", invoiceTerms: "Goods once sold will not be taken back. Interest at 18% p.a. on overdue bills." } },
  itemLines: items,
});
for (const t of ["a4", "a5", "thermal"]) fs.writeFileSync(`.tmp/pdfcheck/inv-${t}.pdf`, Buffer.from(renderSalesInvoicePdf(invoice, { template: t }), "latin1"));
console.log(invoice.upiLink, invoice.payUrl);
