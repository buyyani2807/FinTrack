#!/usr/bin/env node
/**
 * Opt-in live Accounts RLS / API checks against a staging Supabase project.
 *
 * Skips (exit 0) unless all required env vars are set:
 *   SUPABASE_URL
 *   ACCOUNTS_LIVE_OWNER_JWT
 *   ACCOUNTS_LIVE_ACCOUNTANT_JWT   (optional — accountant post OK / GST denied)
 *   ACCOUNTS_LIVE_VIEWER_JWT       (optional — viewer cannot post)
 *   ACCOUNTS_LIVE_COMPANY_A        (uuid)
 *   ACCOUNTS_LIVE_COMPANY_B        (uuid, optional isolation check)
 *
 * Never prints JWTs. Safe to wire as a gated CI job.
 */

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const ownerJwt = process.env.ACCOUNTS_LIVE_OWNER_JWT || "";
const accountantJwt = process.env.ACCOUNTS_LIVE_ACCOUNTANT_JWT || "";
const viewerJwt = process.env.ACCOUNTS_LIVE_VIEWER_JWT || "";
const companyA = process.env.ACCOUNTS_LIVE_COMPANY_A || "";
const companyB = process.env.ACCOUNTS_LIVE_COMPANY_B || "";

function skip(reason) {
  console.log(`[accounts-live] SKIP: ${reason}`);
  process.exit(0);
}

if (!url || !ownerJwt || !companyA) {
  skip("set SUPABASE_URL, ACCOUNTS_LIVE_OWNER_JWT, and ACCOUNTS_LIVE_COMPANY_A to run");
}

const rest = path => `${url.replace(/\/$/, "")}${path}`;

async function rpc(jwt, companyId, fn, args = {}) {
  const response = await fetch(rest(`/rest/v1/rpc/${fn}`), {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "x-acc-company-id": companyId,
    },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data, text };
}

async function select(jwt, companyId, table, query = "select=id&limit=1") {
  const response = await fetch(rest(`/rest/v1/${table}?${query}`), {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
      Authorization: `Bearer ${jwt}`,
      "x-acc-company-id": companyId,
    },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`[accounts-live] PASS ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.error(`[accounts-live] FAIL ${name}: ${err.message}`);
  }
}

const cashSaleLines = async (jwt, companyId) => {
  const coa = await select(jwt, companyId, "acc_coa", "select=id,code&code=in.(1000,4300)&limit=10");
  assert(coa.ok, `could not load COA (${coa.status})`);
  const cash = (coa.data || []).find(row => row.code === "1000");
  const sales = (coa.data || []).find(row => row.code === "4300");
  assert(cash && sales, "need Cash 1000 and Sales 4300 on company A");
  return [
    { coa_id: cash.id, debit: 1, credit: 0, description: "live rls" },
    { coa_id: sales.id, debit: 0, credit: 1, description: "live rls" },
  ];
};

await check("owner can read company A vouchers", async () => {
  const res = await select(ownerJwt, companyA, "acc_vouchers");
  assert(res.ok, `select failed ${res.status} ${res.text}`);
});

await check("owner post is idempotent for same client_request_id", async () => {
  const lines = await cashSaleLines(ownerJwt, companyA);
  const clientRequestId = crypto.randomUUID();
  const first = await rpc(ownerJwt, companyA, "acc_post_voucher", {
    input_voucher_type: "sales",
    input_date: new Date().toISOString().slice(0, 10),
    input_narration: "live idempotency",
    input_lines: lines,
    input_client_request_id: clientRequestId,
  });
  assert(first.ok, `first post failed ${first.status} ${first.text}`);
  const second = await rpc(ownerJwt, companyA, "acc_post_voucher", {
    input_voucher_type: "sales",
    input_date: new Date().toISOString().slice(0, 10),
    input_narration: "live idempotency retry",
    input_lines: lines,
    input_client_request_id: clientRequestId,
  });
  assert(second.ok, `retry post failed ${second.status} ${second.text}`);
  assert(first.data === second.data, "idempotent post must return the same voucher id");
});

if (companyB) {
  await check("company B header does not return company A-only reads mixed", async () => {
    const a = await select(ownerJwt, companyA, "acc_parties", "select=id,company_id&limit=20");
    const b = await select(ownerJwt, companyB, "acc_parties", "select=id,company_id&limit=20");
    assert(a.ok && b.ok, "party selects failed");
    const bleed = (b.data || []).some(row => row.company_id === companyA);
    assert(!bleed, "company B select returned company A party rows");
  });
}

if (viewerJwt) {
  await check("viewer cannot post", async () => {
    const lines = await cashSaleLines(ownerJwt, companyA);
    const res = await rpc(viewerJwt, companyA, "acc_post_voucher", {
      input_voucher_type: "sales",
      input_date: new Date().toISOString().slice(0, 10),
      input_narration: "viewer denied",
      input_lines: lines,
      input_client_request_id: crypto.randomUUID(),
    });
    assert(!res.ok, "viewer post unexpectedly succeeded");
  });
}

if (accountantJwt) {
  await check("accountant cannot save GST settings", async () => {
    const res = await rpc(accountantJwt, companyA, "acc_save_gst_settings", {
      input_gst_registration: "unregistered",
      input_gstin: null,
      input_legal_name: null,
      input_trade_name: null,
      input_state_code: null,
      input_company_id: companyA,
    });
    assert(!res.ok, "accountant GST save unexpectedly succeeded");
  });
}

if (failures.length) {
  console.error(`[accounts-live] ${failures.length} failure(s)`);
  process.exit(1);
}

console.log("[accounts-live] all checks passed");
