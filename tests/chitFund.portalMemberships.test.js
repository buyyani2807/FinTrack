import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("chit portal lists only the signed-in member's own schemes, not others who share the phone", () => {
  const sql = fs.readFileSync("supabase/097_chit_portal_own_memberships.sql", "utf8");
  assert.match(sql, /create or replace function public\.chit_customer_membership_list\(input_enrollment_id uuid\)/);
  assert.match(sql, /e\.member_id = enrollment\.member_id/);
  assert.match(sql, /om\.full_name[\s\S]*= member_name/);
  assert.match(sql, /e\.organization_id = enrollment\.organization_id/);
  assert.match(sql, /revoke execute on function public\.chit_customer_membership_list\(uuid\) from public, anon, authenticated/);
});
