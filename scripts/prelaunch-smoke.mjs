#!/usr/bin/env node
/**
 * Pre-launch smoke checks (no live Supabase required).
 * Usage: node scripts/prelaunch-smoke.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "supabase/036_prelaunch_hardening.sql",
  "scripts/verify-migration-036.sql",
  "api/auth/login.js",
  "api/auth/session.js",
  "e2e/app.spec.js",
  "playwright.config.js",
  ".github/workflows/ci.yml",
  "src/lib/signupGate.js",
  "src/features/legal/LegalPage.jsx",
  "OPERATIONS.md",
  "MIGRATION_CHECKLIST.md",
];

let failed = 0;
const ok = message => console.log(`✔ ${message}`);
const fail = message => { console.error(`✘ ${message}`); failed += 1; };

for (const file of requiredFiles) {
  if (existsSync(join(root, file))) ok(`found ${file}`);
  else fail(`missing ${file}`);
}

const schema = readFileSync(join(root, "supabase/schema.sql"), "utf8");
if (/create or replace function public\.provision_financier/i.test(schema)) ok("provision_financier defined in schema.sql");
else fail("provision_financier missing from schema.sql");

const vercel = readFileSync(join(root, "vercel.json"), "utf8");
if (vercel.includes("Content-Security-Policy")) ok("security headers configured in vercel.json");
else fail("CSP missing from vercel.json");

const chitModule = readFileSync(join(root, "src/features/chitFund/ChitFundModule.jsx"), "utf8");
if (/const \[enriching, setEnriching\] = useState/.test(chitModule)) ok("ChitFundPage enriching state declared");
else fail("ChitFundPage missing enriching state — Chit Fund will crash on load");

if (existsSync(join(root, "e2e/chit-fund.spec.js"))) ok("found e2e/chit-fund.spec.js");
else fail("missing e2e/chit-fund.spec.js");

try {
  execSync("npm test", { cwd: root, stdio: "pipe" });
  ok("unit tests pass");
} catch {
  fail("unit tests failed — run npm test");
}

try {
  execSync("npm run build", { cwd: root, stdio: "pipe" });
  ok("production build succeeds");
} catch {
  fail("production build failed — run npm run build");
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll pre-launch smoke checks passed.");
