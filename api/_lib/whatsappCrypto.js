/* global process */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyBytes() {
  const raw = String(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  // Accept 32-byte base64 or any passphrase (hashed to 32 bytes).
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && Buffer.from(raw, "base64").length === 32) {
    return Buffer.from(raw, "base64");
  }
  return createHash("sha256").update(raw).digest();
}

export function whatsappCryptoConfigured() {
  return Boolean(keyBytes());
}

/** Encrypt a Cloud API access token for storage. Returns empty string when crypto is not configured. */
export function encryptWhatsAppToken(plain) {
  const key = keyBytes();
  const text = String(plain || "");
  if (!key || !text) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptWhatsAppToken(payload) {
  const key = keyBytes();
  const raw = String(payload || "");
  if (!key || !raw.startsWith("v1:")) return "";
  const [, ivB64, tagB64, dataB64] = raw.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
