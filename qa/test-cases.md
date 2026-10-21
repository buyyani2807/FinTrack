# Test cases

Status values: pass, fail, blocked, not run.

## Executed this pass (21 Oct 2026)

| ID | Case | Result |
| --- | --- | --- |
| TC-ENV-01 | Staging session still signed in as financier | Pass |
| TC-CO-01 | Accounts company is Buyyani's Enterprises | Pass |
| TC-TB-01 | Trial balance debit equals credit | Pass. ₹18,03,250.07 both sides, difference ₹0 |
| TC-PAY-01 | November 2026 pay date is on or before today | Fail. Date is 2026-11-30, no max. See BY-01. Month returned to October. No post. |
| TC-CB-01 | Cashbook header balances add up | Pass. −27,49,000 + 24,00,500 + 15,59,500 = 12,11,000 |
| TC-CB-02 | Today with no rows shows the earlier balance in the list | Fail. "Brought forward" absent. See BY-04 |
| TC-UT-01 | `npm test` | Pass. 517 passed, 2 skipped, 0 failed |

## Executed 20 Oct, not repeated, still the evidence

| ID | Case | Result |
| --- | --- | --- |
| TC-AR-01 | Receivables tile equals Who owes me? and the open bills | Pass on Buyyani. ₹2,94,839.83 |
| TC-BS-01 | Assets equal liabilities and equity | Pass. ₹72,12,755.59 |
| TC-CF-01 | Cash flow inflow minus outflow equals net | Pass |
| TC-GST-01 | Output CGST equals output SGST | Fail by one paisa on posted books. See BY-05 |
| TC-VAL-01 | Empty daily customer is refused and the dialog stays open | Pass |
| TC-NAV-01 | Unknown path returns to dashboard | Pass |
| TC-UI-01 | 390px dashboard does not overflow the page | Pass. Trial table scrolls inside the page |
| TC-THEME-01 | Light, dark, light | Pass |

## Follow-up the same afternoon

| ID | Case | Result |
| --- | --- | --- |
| TC-LOAN-01 | Save a ₹100 daily account | Pass. `E2E-TEST-20261021`, paid out ₹100, daily ₹1 × 100 days, received ₹0. Collect disabled until the next day. |
| TC-CHIT-01 | Create, activate, and open live bidding on a new auction | Pass. ₹1,000, 2 members, ₹500 installment, 5% commission. Status opened, then paused. No bid. End bidding disabled. |
| TC-EXP-01 | Open trial balance CSV, Excel, and PDF | Pass. CSV totals ₹18,18,250.08 both sides. Excel is a workbook. PDF is a PDF. |
| TC-WA-01 | Open WhatsApp settings and send a message | Settings pass. Send blocked. Nothing was sent. |
| TC-AG-01 | Agent records a collection | Blocked. Owner page lists agents and routes. The test loan is not assigned. No collection was recorded. Agent login was not used. |
| TC-ROLE-01 | Accountant, viewer, customer, and chit member | Blocked. Only the financier session is available. |
| TC-OUT-01 | Logout and return | Blocked. Logout is visible. Clicking it would end the only session. |

## Not run — do not mark as passed

Logout completion, invalid login, accountant, viewer, agent login, customer portal, chit member portal, password reset, a member bid, a recorded collection, a WhatsApp send, Buyyani bank import, Buyyani period lock, backup restore, bill scan, subscription block, and Playwright.
