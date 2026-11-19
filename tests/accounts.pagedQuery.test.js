import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// accountingRepository.js touches import.meta.env (via src/lib/supabase.js) at module load,
// which plain `node --test` does not provide, so we can't import and call pagedQuery against
// a live/mocked fetch here. Instead — matching this repo's existing pattern for repository
// wiring checks — we assert against the source itself: the fix was a silent data-loss bug
// (companies past ~2,000 vouchers quietly lost older vouchers from every report), so the
// regression to guard is "a hardcoded limit reappears on a data path that scales with usage".
const repoSrc = readFileSync(
  new URL("../src/features/accounts/data/accountingRepository.js", import.meta.url),
  "utf8",
);

test("pagedQuery exists and keeps fetching until a genuinely empty page", () => {
  assert.match(repoSrc, /const pagedQuery = async \(path, token, pageSize = PAGE_SIZE\) => \{/);
  // Must not stop early just because a page came back shorter than requested — Supabase's
  // own "Max Rows" project setting can cap a page below our requested limit, so "short page"
  // is not a reliable end-of-data signal. Only a literally empty page may end the loop.
  assert.doesNotMatch(repoSrc, /batch\.length < pageSize/);
  assert.match(repoSrc, /if \(!batch\.length\) break;/);
  assert.match(repoSrc, /offset \+= batch\.length;/);
});

test("vouchers, voucher lines and GST lines load through pagedQuery, not a fixed limit", () => {
  const loadVouchers = repoSrc.slice(repoSrc.indexOf("export const loadVouchers"), repoSrc.indexOf("export const loadAuditLog"));
  assert.match(loadVouchers, /pagedQuery\(`\/rest\/v1\/acc_vouchers\?/);
  assert.match(loadVouchers, /pagedQuery\(`\/rest\/v1\/acc_voucher_lines\?/);
  assert.match(loadVouchers, /pagedQuery\(`\/rest\/v1\/acc_gst_lines\?/);
  // The old fixed caps (2,000 vouchers / 20,000 lines) must be gone from this fetch path —
  // pagedQuery appends its own &limit=...&offset=... per page instead.
  assert.doesNotMatch(loadVouchers, /limit=2000[^0-9]/);
  assert.doesNotMatch(loadVouchers, /limit=20000/);
});

test("voucher item lines and stock movements load through pagedQuery", () => {
  const itemLinesSection = repoSrc.slice(
    repoSrc.indexOf("const voucherItemLinesPath"),
    repoSrc.indexOf("const STOCK_MOVEMENT_COLUMNS"),
  );
  assert.match(itemLinesSection, /pagedQuery\(voucherItemLinesPath/);
  assert.doesNotMatch(itemLinesSection, /limit=20000/);

  const stockSection = repoSrc.slice(
    repoSrc.indexOf("const stockMovementsPath"),
    repoSrc.indexOf("const mapTradeDocumentLine"),
  );
  assert.match(stockSection, /pagedQuery\(stockMovementsPath/);
  assert.doesNotMatch(stockSection, /limit=20000/);
});
