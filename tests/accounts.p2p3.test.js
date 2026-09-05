import test from "node:test";
import assert from "node:assert/strict";
import {
  assertValidGstin,
  gstinChecksum,
  gstinValidationMessage,
  isValidGstin,
  validateGstSettings,
} from "../src/features/accounts/accountingGst.js";

test("GSTIN checksum matches the GSTN modulo-36 algorithm", () => {
  assert.equal(gstinChecksum("27AAPFU0939F1Z"), "V");
  assert.equal(gstinChecksum("36AAAAA0000A1Z"), "3");
  assert.equal(isValidGstin(""), true);
  assert.equal(isValidGstin("27AAPFU0939F1ZV"), true);
  assert.equal(isValidGstin("36AAAAA0000A1Z3"), true);
  assert.equal(isValidGstin("36AAAAA0000A1Z5"), false);
  assert.equal(gstinValidationMessage("BAD"), "Enter a valid 15-character GSTIN.");
  assert.equal(gstinValidationMessage("36AAAAA0000A1Z5"), "GSTIN checksum is not valid.");
  assert.equal(assertValidGstin("27aapfu0939f1zv"), "27AAPFU0939F1ZV");
  assert.throws(() => assertValidGstin("", { required: true }), /GSTIN is required/);
});

test("registered GST settings require a valid GSTIN and state", () => {
  assert.equal(validateGstSettings({ gstRegistration: "unregistered" }), "");
  assert.equal(validateGstSettings({ gstRegistration: "regular", gstin: "", stateCode: "36" }), "GSTIN is required for a registered company.");
  assert.equal(validateGstSettings({ gstRegistration: "regular", gstin: "36AAAAA0000A1Z5", stateCode: "36" }), "GSTIN checksum is not valid.");
  assert.equal(validateGstSettings({ gstRegistration: "regular", gstin: "36AAAAA0000A1Z3", stateCode: "" }), "State is required for GST.");
  assert.equal(validateGstSettings({ gstRegistration: "regular", gstin: "36AAAAA0000A1Z3", stateCode: "36" }), "");
});
