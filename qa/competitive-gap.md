# Competitive gap

Sources checked 21 Oct 2026:

- Zoho Books feature page: https://www.zoho.com/in/books/accounting-software-features/ — GST return filing as a GST Suvidha Provider, e-invoice and IRN, bank feeds, bank rules, reconciliation.
- Vyapar feature article: https://vyaparapp.in/blog/vyapar-app-features/ — GST invoices, GSTR-1, GSTR-2, GSTR-3B, GSTR-9, HSN sales summary, WhatsApp sharing, UPI collection.
- TallyPrime 6.0 description on a partner site, https://tally.mitsify.com/tally-prime — GSTR-1 and GSTR-3B upload, e-invoice, e-way bill, bank reconciliation, WhatsApp. This is a partner page, not tallysolutions.com. Treat those bullets as the partner's description.

Book Keeper was not checked against a current official page. No Book Keeper row is scored.

FinTrack status uses only behaviour seen on staging or in the local suite.

| Capability | FinTrack | Competitor claim | Gap | Impact | Next step |
| --- | --- | --- | --- | --- | --- |
| Double-entry books, trial balance, P&L, balance sheet | Implemented and verified on Buyyani. Difference ₹0 | Tally, Zoho, Vyapar all advertise this | None on the books that were opened | Core | Keep the debit/credit tests |
| GST invoice split | Implemented but defective on posted Buyyani lines (one paisa). Local fix not deployed | All three advertise GST invoices | Low | Reports look one paisa off | Deploy `fe24657` |
| File GSTR-1 / 3B on the portal | Not implemented | Zoho and the Tally partner page say they file or upload | High | An accountant still files outside FinTrack | Keep in-app GST reports honest; do not claim filing |
| E-invoice IRN | Not implemented | Zoho and the Tally partner page | High for registered businesses that must e-invoice | Cannot replace Zoho or Tally for that step | Document the limit |
| Live bank feeds | Not implemented. CSV import exists and was not completed on Buyyani | Zoho advertises feeds and rules | High | Month-end matching stays manual | Finish a synthetic import on a test company |
| WhatsApp invoice or reminder | Present in settings. Not sent in this audit | Vyapar and the Tally partner page advertise it | Not verified | Do not market it as proven | Test with a sandbox number |
| Payroll | Implemented but defective. Future default date on staging | Tally advertises payroll; Zoho's G2 notes rate payroll lower | Medium | Salary post fails until the date is edited | Deploy `fe24657` |
| Daily / monthly collections and chit | Implemented in the UI. Live auction and new loans not run | Not a Zoho, Tally, or Vyapar core product | FinTrack's own market | This is the differentiation | Run one synthetic scheme and one synthetic loan before launch copy |
| Multi-company | Switcher works. Isolation was not an API test | Zoho and Tally advertise multi-company | Not verified | Do not claim hard isolation beyond the UI | Test with a second user |
