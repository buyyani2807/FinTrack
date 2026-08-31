import test from "node:test";
import assert from "node:assert/strict";
import { financeKindLabel, staffAssignableLoans } from "../src/features/finance/collectionStaff.js";

const statusOf = loan => loan.status;

test("assignment list includes active daily and monthly accounts", () => {
  const loans = [
    { id: "d1", kind: "daily", status: "active", customerName: "Ann", phone: "1", collectionAgentId: "" },
    { id: "m1", kind: "monthly", status: "active", customerName: "Ben", phone: "2", collectionAgentId: "" },
    { id: "d2", kind: "daily", status: "closed", customerName: "Cara", phone: "3", collectionAgentId: "" },
  ];
  assert.deepEqual(staffAssignableLoans(loans, { selectedAgentId: "agent-1", statusOf }).map(loan => loan.id), ["d1", "m1"]);
});

test("search and existing assignment still apply to monthly accounts", () => {
  const loans = [
    { id: "m1", kind: "monthly", status: "active", customerName: "Ravi Kumar", phone: "900", collectionAgentId: "" },
    { id: "m2", kind: "monthly", status: "active", customerName: "Other", phone: "901", collectionAgentId: "someone-else" },
  ];
  assert.deepEqual(
    staffAssignableLoans(loans, { selectedAgentId: "agent-1", search: "ravi", statusOf }).map(loan => loan.id),
    ["m1"],
  );
});

test("financeKindLabel distinguishes daily and monthly", () => {
  assert.equal(financeKindLabel("monthly"), "Monthly");
  assert.equal(financeKindLabel("daily"), "Daily");
});
