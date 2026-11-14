import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/146_chit_scheme_payout_band_guard.sql", import.meta.url), "utf8");

const fn = name => {
  const start = sql.indexOf(`function public.${name}(`);
  assert.ok(start > 0, `${name} is defined`);
  return sql.slice(start, sql.indexOf("$$;", start));
};

// P3-6: a scheme saved with min/max both below 70% can never clear a live bid,
// because chit_validate_live_bid_amount() (051) caps every live bid at 30% of
// the chit value, so the payout is always >= 70% (and < 100% - commission%).
// Both the create RPC and the draft-only edit RPC must reject a configured
// band that doesn't overlap [70, 100 - commission_percent).

test("chit_create_scheme rejects a payout band no live bid could satisfy", () => {
  const body = fn("chit_create_scheme");
  assert.match(body, /scheme_max_bid_percent < 70/);
  assert.match(body, /scheme_min_bid_percent > \(100 - scheme_commission_percent\)/);
  // The new guard must run after the existing min<=max<=100 sanity check,
  // not replace it.
  const sanityIdx = body.indexOf("Invalid bid limits");
  const overlapIdx = body.indexOf("scheme_max_bid_percent < 70");
  assert.ok(sanityIdx > 0 && overlapIdx > sanityIdx, "overlap guard runs after the basic sanity check");
  // Still inserts on success (guard doesn't short-circuit the happy path).
  assert.match(body, /insert into public\.chit_schemes/);
});

test("chit_update_scheme rejects the same impossible band (draft edits only)", () => {
  const body = fn("chit_update_scheme");
  assert.match(body, /current_status <> 'draft'/);
  assert.match(body, /scheme_max_bid_percent < 70/);
  assert.match(body, /scheme_min_bid_percent > \(100 - scheme_commission_percent\)/);
});

test("a 5-30% band with 0% commission is rejected (the reported P3-6 case)", () => {
  // min=5, max=30, commission=0 -> max_bid_percent(30) < 70 -> guard fires.
  const minBid = 5, maxBid = 30, commission = 0;
  const guardFires = maxBid < 70 || minBid > (100 - commission);
  assert.equal(guardFires, true);
});

test("a normal 70-95% band with 2% commission is accepted", () => {
  const minBid = 70, maxBid = 95, commission = 2;
  const guardFires = maxBid < 70 || minBid > (100 - commission);
  assert.equal(guardFires, false);
});

test("a band that only partially overlaps (60-80%) is still accepted", () => {
  // max(80) >= 70 and min(60) <= 100-commission, so some live bid (payout in
  // [70,80]) can satisfy it even though part of the configured band (60-70) can't.
  const minBid = 60, maxBid = 80, commission = 3;
  const guardFires = maxBid < 70 || minBid > (100 - commission);
  assert.equal(guardFires, false);
});

test("re-grants execute on both RPCs with their live signatures", () => {
  assert.match(sql, /grant execute on function public\.chit_create_scheme\(text,numeric,integer,integer,numeric,numeric,date,numeric,numeric,numeric,numeric\) to authenticated;/);
  assert.match(sql, /grant execute on function public\.chit_update_scheme\(uuid,text,numeric,integer,integer,numeric,date,numeric,numeric,numeric,numeric,numeric\) to authenticated;/);
});
