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

test("a member with tickets in several schemes has one portal ID and PIN", () => {
  const sql = fs.readFileSync("supabase/098_chit_portal_one_login_per_member.sql", "utf8");
  assert.match(sql, /function public\.chit_person_key\(input_member_id uuid\)/);
  assert.match(sql, /regexp_replace\(coalesce\(m\.phone, ''\), '\[\^0-9\]', '', 'g'\)[\s\S]*lower\(regexp_replace\(trim\(m\.full_name\)/);
  assert.match(sql, /revoke execute on function public\.chit_person_key\(uuid\) from public, anon, authenticated/);
  assert.match(sql, /distinct on \(person_key\)[\s\S]*order by person_key, enrolled_at, enrollment_id/);
  const enable = sql.slice(sql.indexOf("function public.enable_chit_member_portal"), sql.indexOf("function public.reset_chit_member_portal_pin"));
  assert.match(enable, /public\.chit_person_key\(e\.member_id\) = person/);
  assert.match(enable, /values\(input_enrollment_id, org_id, public_id, pin_value/);
  assert.match(enable, /current_organization_id\(\)/);
  const reset = sql.slice(sql.indexOf("function public.reset_chit_member_portal_pin"), sql.indexOf("function public.chit_customer_portal_login"));
  assert.match(reset, /where portal_id = own_id and organization_id = org_id/);
  const login = sql.slice(sql.indexOf("function public.chit_customer_portal_login"));
  assert.match(login, /limit 1/);
  assert.match(login, /failed_attempts \+ 1[\s\S]*where portal_id = credential\.portal_id/);
});
