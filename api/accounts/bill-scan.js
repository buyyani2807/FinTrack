/* global process */
import { normalizeBillScan } from "../../src/features/accounts/model/billScan.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const json = (res, status, body) => res.status(status).json(body);

const PROMPT = `Read this supplier bill and return JSON only.
Use this shape:
{"supplierName":"","supplierGstin":"","billNumber":"","billDate":"YYYY-MM-DD","paid":false,"lines":[{"name":"","quantity":1,"rate":0,"gstRate":18,"hsn":""}]}
Copy only what is printed. Leave a field empty when it is unreadable. Do not add items that are not on the bill.
billDate is the invoice date. quantity is the billed quantity. rate is the price per unit before tax when that column is printed, otherwise the printed rate. gstRate is the percent, such as 18. paid is true only when the bill is marked paid.`;

function mimeOf(value) {
  const mime = String(value || "").toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return ["image/jpeg", "image/png", "image/webp"].includes(mime) ? mime : "";
}

async function signedIn(token) {
  if (!supabaseUrl || !anonKey || !token) return false;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

function modelText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map(part => part.text || "").join("").trim();
}

export function readFailure(status, payload) {
  const raw = String(payload?.error?.message || payload?.promptFeedback?.blockReason || "");
  const safe = raw
    .replace(/AQ\.[A-Za-z0-9_-]+/g, "")
    .replace(/AIza[A-Za-z0-9_-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (status === 401 || status === 403 || /API key|UNAUTHENTICATED|permission|denied/i.test(safe)) {
    return "Google rejected the Gemini key. Replace GEMINI_API_KEY in Vercel, then redeploy staging.";
  }
  if (status === 404 || /not found|not supported/i.test(safe)) {
    return "The bill reader model is not available. Redeploy after this update.";
  }
  if (safe) return `The bill could not be read. ${safe}`;
  return "The bill could not be read. Try the sample bill again.";
}

function parseModelJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("The bill reader did not return the bill details.");
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!await signedIn(token)) return json(res, 401, { error: "Sign in required" });
  if (!geminiKey) return json(res, 503, { error: "Bill reading is not set up on this server yet." });

  const mimeType = mimeOf(req.body?.mimeType);
  const data = String(req.body?.data || "").replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  if (!mimeType || !data) return json(res, 400, { error: "Choose a photo of the bill." });
  if (data.length > 2_000_000) return json(res, 413, { error: "That photo is too large. Take it again, closer to the bill." });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey,
        },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType, data } },
            ],
          }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, 502, { error: readFailure(response.status, payload) });
    const text = modelText(payload);
    if (!text) return json(res, 502, { error: readFailure(response.status, payload) });
    return json(res, 200, { bill: normalizeBillScan(parseModelJson(text)) });
  } catch (error) {
    return json(res, 502, { error: error?.message || "The bill could not be read. Try the sample bill again." });
  }
}
