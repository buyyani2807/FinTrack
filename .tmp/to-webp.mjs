// Capture-only: convert reviewed PNG screenshots to WebP with Chrome's encoder (never committed).
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const src = process.env.SRC || ".tmp/shots";
const out = process.env.OUT || "public/product";
const names = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
for (const name of names) {
  const png = await readFile(`${src}/${name}.png`);
  const base64 = await page.evaluate(async dataUrl => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/webp", 0.86).split(",")[1];
  }, `data:image/png;base64,${png.toString("base64")}`);
  const webp = Buffer.from(base64, "base64");
  await writeFile(`${out}/${name}.webp`, webp);
  console.log(name, `${Math.round(png.length / 1024)}KB png -> ${Math.round(webp.length / 1024)}KB webp`);
}
await browser.close();
