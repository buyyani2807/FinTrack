import test from "node:test";
import assert from "node:assert/strict";
import { chitTypeLabel, membershipEnrollmentId, portalMemberships } from "../src/features/chitFund/memberPortal.js";

test("one membership does not require a scheme switcher", () => {
  assert.equal(portalMemberships({ memberships: [{ enrollmentId: "e1" }] }).length, 1);
  assert.deepEqual(portalMemberships({}), []);
});

test("multiple memberships keep their enrollment ids for switching", () => {
  const rows = portalMemberships({
    memberships: [
      { enrollmentId: "e1", schemeName: "10 Lakhs", chitType: "auction" },
      { enrollment_id: "e2", schemeName: "Fixed 20", chitType: "fixed" },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(membershipEnrollmentId(rows[0]), "e1");
  assert.equal(membershipEnrollmentId(rows[1]), "e2");
});

test("scheme type labels stay distinct across chit categories", () => {
  assert.equal(chitTypeLabel("auction"), "Auction");
  assert.equal(chitTypeLabel("fixed"), "Fixed");
  assert.equal(chitTypeLabel("fixed_predefined_bid"), "Fixed Predefined Bid");
});
