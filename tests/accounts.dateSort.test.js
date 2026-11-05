import assert from "node:assert/strict";
import { test } from "node:test";
import { sortByDate } from "../src/features/accounts/model/dateSort.js";
import { dayBook } from "../src/features/accounts/model/accountingReports.js";

test("sortByDate orders same-day rows by posted time (newest first)", () => {
  const rows = [
    { id: "a", date: "2026-04-10", voucherNumber: "S-1", postedAt: "2026-04-10T04:00:00.000Z" },
    { id: "b", date: "2026-04-10", voucherNumber: "S-2", postedAt: "2026-04-10T10:00:00.000Z" },
    { id: "c", date: "2026-04-11", voucherNumber: "S-3", postedAt: "2026-04-11T01:00:00.000Z" },
  ];
  assert.deepEqual(
    sortByDate(rows, "date", "desc").map(row => row.voucherNumber),
    ["S-3", "S-2", "S-1"],
  );
  assert.deepEqual(
    sortByDate(rows, "date", "asc").map(row => row.voucherNumber),
    ["S-1", "S-2", "S-3"],
  );
});

test("dayBook sorts chronologically by date then posted time", () => {
  const vouchers = [
    {
      id: "late",
      date: "2026-04-10",
      voucherNumber: "S-2",
      voucherType: "sales",
      status: "posted",
      postedAt: "2026-04-10T10:00:00.000Z",
      lines: [{ debit: 200, credit: 0 }, { debit: 0, credit: 200 }],
    },
    {
      id: "early",
      date: "2026-04-10",
      voucherNumber: "S-1",
      voucherType: "sales",
      status: "posted",
      postedAt: "2026-04-10T04:00:00.000Z",
      lines: [{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }],
    },
  ];
  assert.deepEqual(
    dayBook(vouchers, { from: "2026-04-01", to: "2026-04-30" }).map(row => row.voucherNumber),
    ["S-1", "S-2"],
  );
});
