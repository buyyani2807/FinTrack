# Market readiness

Scores use only checks that were actually run. Unverified areas pull the score down. A higher score would not clear BY-01.

| Dimension | Weight | Score | Why |
| --- | --- | --- | --- |
| Functional workflows | 25% | 58 | Morning score. That afternoon a ₹100 daily loan and a paused live auction were completed. Salary post, other roles, and an agent collection were not. Payroll's default path still fails. Score not raised. |
| Accounting accuracy | 20% | 72 | Buyyani trial balance difference is ₹0. Receivables matched the open bills on 20 Oct. One paisa of GST and the unposted payroll date remain. |
| Security and access | 15% | 35 | One financier session only. Logout, other roles, and API checks were not run. |
| Reliability | 10% | 62 | Navigation and trial balance loaded. Cashbook still lacks the brought-forward line. Unit tests passed. |
| UI and mobile | 10% | 64 | 390px page did not overflow. Payroll date and empty cashbook today view are confusing. Tablet and real devices were not used. |
| Reporting and exports | 10% | 60 | Morning score. That afternoon the Buyyani trial balance CSV, Excel, and PDF opened and the CSV matched the on-screen totals. Score not raised. |
| AI | 5% | 55 | One question matched the receivables. Other AI surfaces were not rechecked. |
| Operations | 5% | 40 | The fix commit is local. Staging does not show it. Monitoring and backup restore were not run on Buyyani. |

Weighted total:

0.25×58 + 0.20×72 + 0.15×35 + 0.10×62 + 0.10×64 + 0.10×60 + 0.05×55 + 0.05×40

= 14.5 + 14.4 + 5.25 + 6.2 + 6.4 + 6.0 + 2.75 + 2.0 = **57.5**, reported as **58 / 100**.

Band: below 60. Not ready for a broad commercial launch.

## Release gate

BY-01 is open on staging. The product stays **no-go** until November payroll on Buyyani's Enterprises shows a pay date on or before today, and a synthetic post (not a real salary) succeeds on a test company.

## Residual risk after that deploy

Still open: other roles, logout completion, a member bid and a finalized auction, an agent recording a collection, and a WhatsApp send. Export files were opened the same afternoon. The published score stays 58. BY-01 was not rechecked.
