/**
 * Module purchase API (Razorpay-ready).
 * Query: ?route=create-order | verify | webhook
 *
 * Never grants entitlements from a browser-only callback.
 * Without RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET → 501, no status change.
 */

const PRODUCT_KEYS = new Set(["finance_daily_monthly", "chit_fund", "accounts", "accounts_pos"]);

function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function readBearer(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export default async function handler(req, res) {
  const route = String(req.query?.route || "").trim();

  if (route === "webhook") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    return res.status(501).json({
      error: "Module payment webhook is not connected. Entitlements are not changed.",
      providerReady: false,
    });
  }

  if (route === "create-order") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!readBearer(req)) return res.status(401).json({ error: "Sign in required." });
    const productKeys = Array.isArray(req.body?.productKeys)
      ? [...new Set(req.body.productKeys.map(String))].filter(key => PRODUCT_KEYS.has(key))
      : [];
    if (!productKeys.length) return res.status(400).json({ error: "Select at least one module." });
    if (!razorpayConfigured()) {
      return res.status(501).json({
        error: "Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET). Modules are not charged or unlocked from this button yet. Contact FinTrack support after payment, or add Razorpay env vars and redeploy.",
        providerReady: false,
        productKeys,
        assumedBilling: {
          monthlyBasePaise: 49800,
          annualBasePaise: 597600,
          gstRate: 0.18,
          currency: "INR",
          periods: ["monthly", "annual"],
        },
      });
    }
    return res.status(501).json({
      error: "Razorpay order creation is stubbed until live order API wiring is verified in staging.",
      providerReady: false,
      productKeys,
    });
  }

  if (route === "verify") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    return res.status(501).json({
      error: "Payment verification requires a signed Razorpay payload on the server.",
      providerReady: false,
    });
  }

  return res.status(404).json({ error: "Unknown billing route. Use ?route=create-order|verify|webhook." });
}
