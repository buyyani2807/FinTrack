import { useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import { Check } from "lucide-react";
import { MODULE_PRODUCT_LIST, cartTotals, priceForProduct } from "./moduleProducts.js";
import { catalogWithPurchaseState } from "./moduleAccess.js";

/**
 * Module selection / unlock store.
 * Payment provider may still be disconnected — Unlock explains next step without fake grants.
 */
export function ModuleStorePage() {
  const { workspace, token, moduleState, refreshModuleEntitlements, access } = useOutletContext() || {};
  const [params] = useSearchParams();
  const focusKey = params.get("product") || "";
  const isOwner = access?.isOwner || workspace?.role === "owner";
  const catalog = useMemo(
    () => catalogWithPurchaseState(moduleState),
    [moduleState],
  );
  const [period, setPeriod] = useState("monthly");
  const [selected, setSelected] = useState(() => new Set(focusKey ? [focusKey] : []));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const yearly = period === "annual";

  const lines = MODULE_PRODUCT_LIST.filter(product => selected.has(product.key));
  const totals = cartTotals([...selected], period);

  const toggle = key => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (key === "accounts_pos" && next.has(key)) next.delete("accounts");
      if (key === "accounts" && next.has(key)) next.delete("accounts_pos");
      return next;
    });
  };

  const startCheckout = async () => {
    if (!isOwner) {
      setNotice("Only the business owner can purchase modules.");
      return;
    }
    if (!lines.length) {
      setNotice("Select at least one module.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/billing/modules?route=create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          productKeys: [...selected],
          period,
          idempotencyKey: `mod-${workspace?.id || "org"}-${period}-${[...selected].sort().join("-")}-${Date.now()}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 501 || body?.providerReady === false) {
        setNotice(body?.error
          || "Card payment is not connected yet. Contact MyFinTracker support to unlock modules after payment, or configure Razorpay on the server.");
        return;
      }
      if (!response.ok) {
        setNotice(body?.error || "Could not start payment.");
        return;
      }
      setNotice("Payment order created. Complete checkout in the payment window when the provider is connected.");
      await refreshModuleEntitlements?.();
    } catch (err) {
      setNotice(err?.message || "Could not start payment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="ft-module-store">
      <div className="ft-mod">
        <header className="ft-mod-head">
          <p className="ft-mod-kicker">Modules</p>
          <h1>Pay for the modules you need.</h1>
        </header>

        <div className="ft-mod-bill" role="tablist" aria-label="Billing period">
          <button type="button" role="tab" aria-selected={!yearly} onClick={() => setPeriod("monthly")}>Monthly</button>
          <button type="button" role="tab" aria-selected={yearly} onClick={() => setPeriod("annual")}>Yearly</button>
        </div>

        <div className="ft-mod-grid">
          {catalog.map(product => {
            const isOn = selected.has(product.key);
            const price = priceForProduct(product, period);
            return (
              <article
                key={product.key}
                className={`ft-mod-card${isOn ? " is-selected" : ""}${product.owned ? " is-owned" : ""}`}
              >
                <header className="ft-mod-card-head">
                  {(product.owned || isOn) && (
                    <p className={`ft-mod-state${product.owned ? " is-owned" : ""}`}>
                      {product.owned ? "Active" : "Selected"}
                    </p>
                  )}
                  <div className="ft-mod-title">
                    <h2>{product.name}</h2>
                    <p className="ft-mod-price">
                      <strong>{price.baseLabel}</strong>
                      <span>{yearly ? "/ year" : "/ month"} + GST</span>
                    </p>
                  </div>
                </header>
                <p className="ft-mod-desc">{product.description}</p>
                <div className="ft-mod-includes">
                  <p>Includes</p>
                  <ul>
                    {product.includes.map(item => (
                      <li key={item}><span aria-hidden="true"><Check size={15} strokeWidth={2.5} /></span>{item}</li>
                    ))}
                  </ul>
                </div>
                {product.owned ? (
                  <p className="ft-mod-owned">Active for this business.</p>
                ) : (
                  <button
                    type="button"
                    className={`btn${isOn ? " primary" : ""}`}
                    disabled={!isOwner}
                    onClick={() => toggle(product.key)}
                  >
                    {isOn ? "Selected" : "Select"}
                  </button>
                )}
              </article>
            );
          })}
        </div>

        <section className="ft-mod-review">
          <h2>Your selection</h2>
          {lines.length ? (
            <ul>
              {lines.map(product => {
                const price = priceForProduct(product, period);
                return (
                  <li key={product.key}>
                    <span>{product.name}</span>
                    <strong>{price.baseLabel} {yearly ? "/ year" : "/ month"} + GST</strong>
                  </li>
                );
              })}
            </ul>
          ) : <p className="ft-mod-empty">No modules selected.</p>}
          <p className="ft-mod-total">
            <span>Payable now</span>
            <strong>{lines.length ? totals.totalLabel : "₹0"}</strong>
            {lines.length ? <small>incl. GST · {totals.baseLabel} + GST</small> : null}
          </p>
          {isOwner ? (
            <button type="button" className="btn primary" disabled={busy || !lines.length} onClick={startCheckout}>
              {busy ? "Starting…" : "Pay & unlock"}
            </button>
          ) : (
            <p className="ft-mod-empty">The business owner purchases modules.</p>
          )}
          {notice ? <p className="ft-subscribe-note" role="status">{notice}</p> : null}
          <p className="ft-mod-note">Your 14-day free trial still opens every module. After the trial, only what you unlock stays open. Your records stay.</p>
          <p className="ft-mod-back"><Link to="/subscribe">Back to billing</Link></p>
        </section>
      </div>
    </main>
  );
}
