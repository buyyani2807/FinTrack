import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readLogoFile } from "../src/lib/logoUpload.js";

test("readLogoFile rejects non-image file types before touching any DOM API", async () => {
  // This branch runs before FileReader/Image/canvas, so it's safe to exercise under plain
  // node:test (no DOM). The actual read/resize/encode path needs a browser and is covered by
  // this file existing in both Accounts (document settings) and Business details.
  await assert.rejects(() => readLogoFile({ type: "application/pdf" }), /PNG, JPG or WebP/);
  await assert.rejects(() => readLogoFile({ type: "text/plain" }), /PNG, JPG or WebP/);
});

// Both logo fields (Accounts document settings, and Business details under Settings) must
// share this one implementation, so a fix to resizing/encoding/size-limit logic applies
// everywhere a logo can be uploaded, not just wherever it was last touched.
test("Accounts document settings and Business details both upload through the shared logoUpload module", () => {
  const accDocsSrc = readFileSync(
    new URL("../src/features/accounts/components/AccDocumentsWorkspace.jsx", import.meta.url),
    "utf8",
  );
  const receiptSettingsSrc = readFileSync(
    new URL("../src/features/receipts/ReceiptSettingsPage.jsx", import.meta.url),
    "utf8",
  );
  assert.match(accDocsSrc, /import \{ readLogoFile \} from "\.\.\/\.\.\/\.\.\/lib\/logoUpload\.js";/);
  assert.match(receiptSettingsSrc, /import \{ readLogoFile \} from "\.\.\/\.\.\/lib\/logoUpload\.js";/);
  // Neither file should carry its own copy of the resize/encode logic any more.
  assert.doesNotMatch(accDocsSrc, /canvas\.toDataURL/);
  assert.doesNotMatch(receiptSettingsSrc, /canvas\.toDataURL/);
});

test("Business details logo field is an upload, not a pasted URL", () => {
  const src = readFileSync(new URL("../src/features/receipts/ReceiptSettingsPage.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /type="url"[^>]*companyLogoUrl|Logo URL/);
  assert.match(src, /type="file" accept="image\/png,image\/jpeg,image\/webp" hidden onChange=\{chooseLogo\}/);
  assert.match(src, />Remove</);
});
