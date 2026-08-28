#!/usr/bin/env node
/**
 * Audits local or CI environment variables against FinTrack's Vercel requirements.
 * Does not print secret values — only presence and basic shape checks.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const loadDotEnv = () => {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
};

const env = { ...loadDotEnv(), ...process.env };
const read = key => String(env[key] || "").trim();

const checks = [
  {
    key: "VITE_SUPABASE_URL",
    required: true,
    scope: "Production + Preview + Development",
    validate: v => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v),
    hint: "Supabase → Project Settings → API → Project URL",
  },
  {
    key: "VITE_SUPABASE_ANON_KEY",
    required: true,
    scope: "Production + Preview + Development",
    validate: v => v.startsWith("eyJ") && v.length > 100,
    hint: "Supabase → Project Settings → API → anon public key",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    scope: "Production + Preview (server only)",
    validate: v => v.startsWith("eyJ") && v.length > 100,
    hint: "Supabase → Project Settings → API → service_role (never expose to browser)",
  },
  {
    key: "VITE_ALLOW_PUBLIC_SIGNUP",
    required: false,
    scope: "Optional — unset or true = signup visible",
    validate: v => ["", "true", "false"].includes(v.toLowerCase()),
    hint: "Set false to hide Create business account",
  },
  {
    key: "VITE_SIGNUP_INVITE_CODE",
    required: false,
    scope: "Optional client invite gate",
    validate: () => true,
    hint: "Must match Supabase app.fintrack_signup_invite_code when server invite is set",
  },
  {
    key: "VITE_SENTRY_DSN",
    required: false,
    scope: "Optional error tracking",
    validate: v => !v || v.startsWith("https://"),
    hint: "Add @sentry/react before enabling in production",
  },
];

let failed = 0;
console.log("FinTrack Vercel environment audit\n");

for (const check of checks) {
  const value = read(check.key);
  const present = Boolean(value);
  let ok = true;
  let note = "";

  if (check.required && !present) {
    ok = false;
    note = "missing (required)";
  } else if (present && check.validate && !check.validate(value)) {
    ok = false;
    note = "present but invalid shape";
  } else if (present) {
    note = "ok";
  } else {
    note = "not set (optional)";
  }

  const icon = ok ? "✔" : "✖";
  if (!ok) failed += 1;
  console.log(`${icon} ${check.key} — ${note}`);
  console.log(`   Scope: ${check.scope}`);
  console.log(`   Hint: ${check.hint}`);
}

console.log("\nSupabase database (manual):");
console.log("  • Run migrations through 036_prelaunch_hardening.sql");
console.log("  • Run scripts/verify-migration-036.sql — each row should show ok = 1");

console.log("\nVercel project (manual):");
console.log("  • Security headers: vercel.json CSP present");
console.log("  • Redeploy after changing any env var");
console.log("  • Monitor /api/auth/session for auth health");

if (existsSync(path.join(root, ".env"))) {
  console.log("\nLoaded variables from .env (values not printed).");
} else {
  console.log("\nNo .env file found — checking process environment only.");
}

const testRun = spawnSync("npm", ["test"], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
if (testRun.status !== 0) {
  console.error("\n✖ npm test failed during audit.");
  failed += 1;
} else {
  console.log("\n✔ npm test passed");
}

if (failed) {
  console.error(`\n${failed} audit check(s) failed.`);
  process.exit(1);
}

console.log("\nAll automated env audit checks passed.");
