// Capture-only: keep the top `height` pixels of a PNG (never committed).
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const [file, height] = [process.argv[2], Number(process.argv[3])];
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const png = await readFile(file);
const base64 = await page.evaluate(async ({ dataUrl, height }) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
}, { dataUrl: `data:image/png;base64,${png.toString("base64")}`, height });
await writeFile(file, Buffer.from(base64, "base64"));
await browser.close();
