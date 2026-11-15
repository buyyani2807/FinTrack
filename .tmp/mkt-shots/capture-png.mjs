import { chromium } from "playwright-core";
import { mkdirSync, copyFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../../public/product");
mkdirSync(outDir, { recursive: true });

const shots = [
  { html: "counter-mock.html", name: "accounts-counter" },
  { html: "documents-mock.html", name: "accounts-documents" },
  { html: "payroll-mock.html", name: "accounts-payroll" },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 2720, height: 1720 }, deviceScaleFactor: 1 });

for (const shot of shots) {
  await page.goto(pathToFileURL(join(__dirname, shot.html)).href, { waitUntil: "load" });
  const pngPath = join(outDir, `${shot.name}.png`);
  await page.screenshot({ path: pngPath, type: "png" });
  // Keep a working copy in tmp for review
  copyFileSync(pngPath, join(__dirname, `${shot.name}.png`));
  console.log("wrote", pngPath);
}

await browser.close();
console.log("done");
