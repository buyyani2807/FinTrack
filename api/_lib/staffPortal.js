/* global process */
// Staff app endpoint: sign in with a Staff ID and PIN, punch in and out, read own payslips, ask for leave.
// Hobby plan allows 12 serverless functions, so this is served by api/auth/agent-login.js:
// vercel.json rewrites /api/staff/:action to /api/auth/agent-login?staff=:action.
//
// Staff are not Supabase Auth users. The browser holds an opaque cookie; only its SHA-256 hash is stored.
// Every database call below uses the service role and a staff_portal_* function that works for that one employee.
import { createHash, randomBytes } from "node:crypto";
import { serviceRpc } from "./agentPortal.js";

export const STAFF_COOKIE = "fintrack_staff";
const MAX_AGE = 60 * 60 * 24 * 30;
const MAX_PHOTO_CHARS = 280000;

function cookieFlags(maxAge) {
  const secure = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  return ["HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${maxAge}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
}

export function readStaffCookie(req) {
  const match = String(req.headers?.cookie || "")
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${STAFF_COOKIE}=`));
  if (!match) return "";
  const value = decodeURIComponent(match.slice(STAFF_COOKIE.length + 1));
  return /^[A-Za-z0-9_-]{40,60}$/.test(value) ? value : "";
}

export const hashToken = token => createHash("sha256").update(String(token)).digest("hex");

const number = value => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const isoDate = value => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null);

// Rewrites pass the action as ?staff=<action>.
export function staffAction(req) {
  const raw = req.query?.staff;
  return String(Array.isArray(raw) ? raw[0] : raw || "").toLowerCase();
}

function sendPortal(res, body) {
  if (body?.error === "signed_out") {
    res.setHeader("Set-Cookie", `${STAFF_COOKIE}=; ${cookieFlags(0)}`);
    return res.status(401).json({ error: "Sign in again." });
  }
  if (body?.error) return res.status(400).json({ error: body.error });
  return res.status(200).json(body || {});
}

export async function staffPortal(req, res) {
  const action = staffAction(req);
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "The staff app is not configured yet." });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    if (action === "login") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const staffId = String(body.staffId || "").trim().toUpperCase();
      const pin = String(body.pin || "").trim();
      if (!/^ST-[0-9A-F]{8}$/.test(staffId) || !/^[0-9]{6}$/.test(pin)) {
        return res.status(400).json({ error: "Enter your Staff ID and 6-digit PIN." });
      }
      const token = randomBytes(32).toString("base64url");
      const result = await serviceRpc("staff_portal_login", { input_staff_id: staffId, input_pin: pin, input_token_hash: hashToken(token) });
      if (!result?.ok) {
        const message = result?.error || "Invalid Staff ID or PIN";
        return res.status(/too many|switched off/i.test(message) ? 403 : 401).json({ error: message });
      }
      res.setHeader("Set-Cookie", `${STAFF_COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(MAX_AGE)}`);
      return res.status(200).json({ ok: true });
    }

    const token = readStaffCookie(req);
    if (action === "logout") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      if (token) await serviceRpc("staff_portal_logout", { input_token_hash: hashToken(token) }).catch(() => null);
      res.setHeader("Set-Cookie", `${STAFF_COOKIE}=; ${cookieFlags(0)}`);
      return res.status(204).end();
    }
    if (!token) return res.status(401).json({ error: "Sign in again." });
    const tokenHash = hashToken(token);

    if (action === "home") {
      const month = isoDate(req.method === "GET" ? req.query?.month : body.month);
      return sendPortal(res, await serviceRpc("staff_portal_home", { input_token_hash: tokenHash, input_month: month }));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (action === "punch") {
      const photo = String(body.photo || "");
      if (photo.length > MAX_PHOTO_CHARS || (photo && !/^[A-Za-z0-9+/=]+$/.test(photo))) {
        return res.status(400).json({ error: "The photo could not be read. Try again." });
      }
      return sendPortal(res, await serviceRpc("staff_portal_punch", {
        input_token_hash: tokenHash,
        input_kind: body.kind === "out" ? "out" : "in",
        input_lat: number(body.lat),
        input_lng: number(body.lng),
        input_accuracy: number(body.accuracy),
        input_photo: photo,
      }));
    }
    if (action === "leave") {
      return sendPortal(res, await serviceRpc("staff_portal_request_leave", {
        input_token_hash: tokenHash,
        input_leave_type: String(body.leaveType || ""),
        input_from: isoDate(body.fromDate),
        input_to: isoDate(body.toDate),
        input_note: String(body.note || "").slice(0, 240),
      }));
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    const message = String(error?.message || "");
    if (/staff_portal_|schema cache|could not find the function/i.test(message)) {
      return res.status(500).json({ error: "The staff app is not set up yet. Ask your employer to finish the setup." });
    }
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}
