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

## Not run — do not mark as passed

Logout, invalid login, accountant, viewer, agent, customer portal, chit member portal, password reset, session expiry, new daily or monthly customer save, a real collection, chit scheme create, auction, WhatsApp, Buyyani bank import, Buyyani period lock, backup restore, bill scan, export file open, subscription block, and Playwright.
