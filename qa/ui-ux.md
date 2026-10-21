# UI and UX

Desktop staging, 21 Oct, plus the 20 Oct mobile check. No redesign was made.

## Confirmed

- Cashbook header numbers are readable and internally consistent. The Today list is empty while cash is largely negative, so the screen does not tell the owner where the balance came from. Severity P2, defect BY-04.
- Payroll month is a dropdown. The pay date for November looks like a normal date and is a future date. Severity P1, defect BY-01.
- At 390px width, the dashboard body stayed at 390px. The trial balance table is 560px inside its own scroller. Page-level horizontal scroll was not observed. Severity: none for the page; tables still need sideways scroll on a phone.
- Theme switch light to dark to light worked.

## Not rechecked this pass

Tablet width, iOS and Android device engines, keyboard-only paths through every voucher, and touch target sizes. Those remain unverified.
