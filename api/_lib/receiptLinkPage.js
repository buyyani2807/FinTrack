/* global process, Buffer */
// Short bill links sent on WhatsApp: myfintracker.com/b/<code> and its preview card
// /b/<code>/card.png. Vercel Hobby allows 12 serverless functions, so this is served by
// api/accounts/bill-scan.js through vercel.json rewrites (same pattern as staffPortal.js).
//
// The page carries Open Graph tags (shop name, amount, Paid / Balance due, card image)
// so WhatsApp shows a preview card, then opens the PDF from the private "receipts"
// bucket through a signed URL that lasts one hour. Rows come from receipt_links
// (supabase/155_receipt_short_links.sql), read with the service role.
import { readFileSync } from "node:fs";

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const supabaseUrl = readEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const serviceHeaders = () => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" });

const CODE = /^[a-f0-9]{12}$/;

/** { code, card } when this request is a bill link (rewritten with ?receipt=), else null. */
export function receiptLinkRequest(req) {
  const code = String(req.query?.receipt || "").trim().toLowerCase();
  if (!code) return null;
  return { code, card: String(req.query?.card || "") === "1" };
}

const rupees = value => {
  const amount = Number(value || 0);
  const paise = Math.round(amount * 100) % 100 !== 0;
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]);
const billDate = value => {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
};

export async function readReceiptLink(code) {
  if (!CODE.test(code) || !supabaseUrl || !serviceKey) return null;
  const select = "storage_path,business_name,customer_name,bill_no,bill_date,amount,balance,expires_at";
  const response = await fetch(`${supabaseUrl}/rest/v1/receipt_links?code=eq.${code}&select=${select}`, { headers: serviceHeaders() });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function signedPdfUrl(path) {
  const safePath = String(path || "").split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/receipts/${safePath}`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!response.ok) return "";
  const body = await response.json().catch(() => ({}));
  const signed = String(body.signedURL || body.signedUrl || "");
  return signed ? `${supabaseUrl}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}` : "";
}

function originOf(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

function messagePage(res, status, title, body) {
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f1e7;color:#2e3a5c;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}main{background:#fff;border-radius:16px;padding:28px;max-width:420px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.08)}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#5c6378}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></main></body></html>`);
}

async function servePage(req, res, code) {
  const row = await readReceiptLink(code);
  if (!row) return messagePage(res, 404, "Bill not found", "This bill link is not valid. Ask the shop to send it again.");
  const shop = row.business_name || "Your shop";
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return messagePage(res, 410, "This bill link has expired", `Ask ${shop} to send the bill again.`);
  }
  const pdfUrl = await signedPdfUrl(row.storage_path);
  if (!pdfUrl) return messagePage(res, 404, "Bill not found", `This bill is no longer available. Ask ${shop} to send it again.`);

  const origin = originOf(req);
  const balance = Number(row.balance || 0);
  const status = balance > 0 ? `Balance due ${rupees(balance)}` : "Paid";
  const title = `${shop} · Bill ${rupees(row.amount)}`;
  const description = [row.bill_no ? `Bill No ${row.bill_no}` : "", billDate(row.bill_date), status, "Tap to view your bill"].filter(Boolean).join(" · ");
  const card = `${origin}/b/${code}/card.png`;
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(shop)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(`${origin}/b/${code}`)}">
<meta property="og:image" content="${escapeHtml(card)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="1;url=${escapeHtml(pdfUrl)}">
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f1e7;color:#2e3a5c;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}main{background:#fff;border-radius:16px;padding:28px;max-width:420px;width:100%;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.08)}h1{font-size:22px;margin:0 0 14px}.amt{font-size:36px;font-weight:700;margin:4px 0}.pill{display:inline-block;padding:4px 14px;border-radius:999px;font-size:13px;font-weight:600;color:#fff;background:${balance > 0 ? "#c9443f" : "#2f8a57"}}.meta{color:#5c6378;font-size:14px;margin:14px 0 20px}a.btn{display:inline-block;background:#2e3a5c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600}</style></head>
<body><main><h1>${escapeHtml(shop)}</h1><div>Bill Amount</div><div class="amt">${escapeHtml(rupees(row.amount))}</div><span class="pill">${escapeHtml(status)}</span>
<p class="meta">${escapeHtml([row.bill_no ? `Bill No ${row.bill_no}` : "", billDate(row.bill_date)].filter(Boolean).join(" · "))}</p>
<a class="btn" href="${escapeHtml(pdfUrl)}">View bill (PDF)</a></main></body></html>`);
}

let fonts = null;
function cardFonts() {
  if (!fonts) {
    fonts = [
      { name: "Inter", data: readFileSync(new URL("./fonts/Inter-Regular-subset.otf", import.meta.url)), weight: 400, style: "normal" },
      { name: "Inter", data: readFileSync(new URL("./fonts/Inter-Bold-subset.otf", import.meta.url)), weight: 700, style: "normal" },
    ];
  }
  return fonts;
}

const el = (type, style, children) => ({ type, props: { style, children } });

/** 1200x630 preview card: shop name, bill amount, Paid / Unpaid pill, bill date. */
export function receiptCardElement(row) {
  const balance = Number(row.balance || 0);
  const shop = String(row.business_name || "Your shop");
  const date = billDate(row.bill_date);
  return el("div", {
    width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #e9c98f 0%, #d9a55a 100%)", fontFamily: "Inter",
  }, [
    el("div", {
      width: 1080, height: 520, background: "#ffffff", borderRadius: 36, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.18)", padding: "0 60px",
    }, [
      el("div", { fontSize: shop.length > 26 ? 52 : 64, fontWeight: 700, color: "#2e3a5c", textAlign: "center", lineHeight: 1.1 }, shop.toUpperCase()),
      el("div", { width: 120, height: 4, background: "#d9a55a", borderRadius: 2, margin: "26px 0 22px" }, ""),
      el("div", { fontSize: 34, color: "#5c6378" }, balance > 0 ? "Balance Due" : "Bill Amount"),
      el("div", { fontSize: 104, fontWeight: 700, color: "#2e3a5c", lineHeight: 1.15 }, rupees(balance > 0 ? balance : row.amount)),
      el("div", {
        marginTop: 14, padding: "8px 30px", borderRadius: 999, fontSize: 30, fontWeight: 700, color: "#ffffff",
        background: balance > 0 ? "#c9443f" : "#2f8a57",
      }, balance > 0 ? "Unpaid" : "Paid"),
      el("div", { marginTop: 30, fontSize: 28, color: "#5c6378" }, [row.bill_no ? `Bill No ${row.bill_no}` : "", date ? `Bill Date ${date}` : ""].filter(Boolean).join("   ·   ") || " "),
    ]),
    el("div", { position: "absolute", bottom: 18, right: 40, fontSize: 22, color: "#5a3d12" }, "via MyFinTracker"),
  ]);
}

async function serveCard(res, code) {
  const row = await readReceiptLink(code);
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    res.status(302);
    res.setHeader("Location", "/brand/og-share.png");
    return res.end();
  }
  const { ImageResponse } = await import("@vercel/og");
  const image = new ImageResponse(receiptCardElement(row), { width: 1200, height: 630, fonts: cardFonts() });
  const png = Buffer.from(await image.arrayBuffer());
  res.status(200);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.send(png);
}

export async function serveReceiptLink(req, res, { code, card }) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "Method not allowed" });
  try {
    return card ? await serveCard(res, code) : await servePage(req, res, code);
  } catch {
    return messagePage(res, 500, "Could not open this bill", "Please try again in a moment.");
  }
}
