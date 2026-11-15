import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../../public/product");
mkdirSync(outDir, { recursive: true });

const shots = [
  { html: "counter-mock.html", name: "accounts-counter", alt: "Counter POS till with item search, bill lines, cash tendered, change due, and Charge" },
  { html: "documents-mock.html", name: "accounts-documents", alt: "Accounts Documents quotations list with open quotes ready to convert to orders or invoices" },
  { html: "payroll-mock.html", name: "accounts-payroll", alt: "Accounts Pay with employee payroll totals and payslip rows for the month" },
];

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch {
  // installed below if missing
}

async function ensureSharp() {
  if (sharp) return sharp;
  const { execSync } = await import("child_process");
  execSync("npm install --no-save --no-package-lock sharp@0.33.5", {
    cwd: join(__dirname, "../.."),
    stdio: "inherit",
  });
  sharp = createRequire(import.meta.url)("sharp");
  return sharp;
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 2720, height: 1720 },
  deviceScaleFactor: 1,
});

const img = await ensureSharp();

for (const shot of shots) {
  const fileUrl = pathToFileURL(join(__dirname, shot.html)).href;
  await page.goto(fileUrl, { waitUntil: "networkidle" });
  const pngPath = join(__dirname, `${shot.name}.png`);
  await page.screenshot({ path: pngPath, type: "png", fullPage: false });
  const webpPath = join(outDir, `${shot.name}.webp`);
  await img(readFileSync(pngPath)).webp({ quality: 82 }).toFile(webpPath);
  console.log("wrote", webpPath);
}

await browser.close();
writeFileSync(join(__dirname, "shot-alts.json"), JSON.stringify(Object.fromEntries(shots.map(s => [s.name, s.alt])), null, 2));
console.log("done");
