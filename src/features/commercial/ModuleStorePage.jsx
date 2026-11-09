import { useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import { Check, Lock } from "lucide-react";
import { MODULE_PRODUCT_LIST, formatModulePrice } from "./moduleProducts.js";
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
  const [selected, setSelected] = useState(() => new Set(focusKey ? [focusKey] : []));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = key => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // accounts_pos replaces accounts selection
      if (key === "accounts_pos" && next.has(key)) next.delete("accounts");
      if (key === "accounts" && next.has(key)) next.delete("accounts_pos");
      return next;
    });
  };

  const lines = MODULE_PRODUCT_LIST.filter(product => selected.has(product.key));
  const totalPaise = lines.reduce((sum, product) => sum + Number(product.amountPaise || 0), 0);
  const totalLabel = formatModulePrice({ amountPaise: totalPaise }).display;

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
          idempotencyKey: `mod-${workspace?.id || "org"}-${[...selected].sort().join("-")}-${Date.now()}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 501 || body?.providerReady === false) {
        setNotice(body?.error
          || "Card payment is not connected yet. Contact FinTrack support to unlock modules after payment, or configure Razorpay on the server.");
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
      <p className="ft-kicker">Modules</p>
      <h1>Choose modules for this business</h1>
      <p className="ft-subscribe-lead">
        Each module is {formatModulePrice(MODULE_PRODUCT_LIST[0]).display} by default.
        Your 14-day free trial still opens every module. Existing full-access workspaces stay unlocked.
      </p>
      <div className="ft-module-store-grid">
        {catalog.map(product => {
          const price = formatModulePrice(product);
          const isOn = selected.has(product.key);
          return (
            <article
              key={product.key}
              className={`ft-module-card${isOn ? " is-selected" : ""}${product.owned ? " is-owned" : ""}`}
            >
              <header>
                <h2>{product.name}</h2>
                {product.owned
                  ? <span className="badge active"><Check size={14} aria-hidden="true" /> Active</span>
                  : <span className="badge"><Lock size={14} aria-hidden="true" /> Locked</span>}
              </header>
              <p>{product.description}</p>
              <ul>{product.includes.map(item => <li key={item}>{item}</li>)}</ul>
              <p className="ft-plan-price">{price.label} <span>/ {price.periodLabel}</span></p>
              {product.owned ? (
                <p className="small">Purchased for this business.</p>
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
      <section className="ft-module-store-review">
        <h2>Review</h2>
        {lines.length ? (
          <ul>{lines.map(product => (
            <li key={product.key}>{product.name} — {formatModulePrice(product).display}</li>
          ))}</ul>
        ) : <p className="small">No modules selected.</p>}
        <p className="ft-module-store-total"><strong>Total:</strong> {lines.length ? totalLabel : "₹0"}</p>
        {isOwner ? (
          <button type="button" className="btn primary" disabled={busy || !lines.length} onClick={startCheckout}>
            {busy ? "Starting…" : "Pay & unlock"}
          </button>
        ) : (
          <p>The business owner purchases modules.</p>
        )}
        {notice ? <p className="ft-subscribe-note" role="status">{notice}</p> : null}
        <p><Link to="/subscribe">Back to billing</Link></p>
      </section>
    </main>
  );
}
