import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, Outlet, useOutletContext } from "react-router";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle.jsx";
import { FEATURE_CATEGORIES, featureBySlug } from "./catalog.js";
import marketingStyles from "./marketing.css?inline";
import { TrialBanner } from "../commercial/TrialBanner.jsx";
import { subscriptionLockCopy } from "../commercial/trial.js";
import { featurePath, marketingPaths } from "./paths.js";

const LINKS = [
  { to: marketingPaths.features, label: "Features" },
  { to: marketingPaths.solutions, label: "Solutions" },
  { to: marketingPaths.security, label: "Security" },
  { to: marketingPaths.pricing, label: "Pricing" },
  { to: marketingPaths.resources, label: "Resources" },
];

const MENU_MODULES = {
  accounts: ["accounts-overview", "vouchers", "receivables", "inventory", "gst-preparation", "bank-reconciliation"],
  intelligence: ["ask-the-books", "bill-scanning", "bookkeeping-suggestions", "attention-center", "anomaly-detection"],
};

function Brand() {
  return <Link to={marketingPaths.home} className="mkt-brand" aria-label="FinTrack home">FIN<span>Track</span></Link>;
}

export function MarketingLayout() {
  const { signedIn = false, subscription = null, isOwner = false } = useOutletContext() || {};
  const trialEnded = subscriptionLockCopy(subscription);
  const [open, setOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const menuId = useId();
  const productId = useId();
  const productRef = useRef(null);
  const close = () => setOpen(false);
  const openModule = (event, id) => {
    setProductOpen(false);
    close();
    const node = document.getElementById(id);
    if (!node) return;
    event.preventDefault();
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", `#${id}`);
  };
  useEffect(() => {
    if (!open && !productOpen) return undefined;
    const onKey = event => {
      if (event.key === "Escape") {
        setOpen(false);
        setProductOpen(false);
      }
    };
    const onPointer = event => {
      if (productRef.current && !productRef.current.contains(event.target)) setProductOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open, productOpen]);

  const login = signedIn
    ? <Link className="mkt-btn" to="/dashboard">Open FinTrack</Link>
    : <Link className="mkt-btn mkt-login-link" to={marketingPaths.login}>Login</Link>;
  const start = signedIn
    ? <Link className="mkt-btn primary" to="/dashboard">Open FinTrack</Link>
    : <Link className="mkt-btn primary" to={marketingPaths.signup}>Start free</Link>;

  return <div className="mkt">
    <style>{marketingStyles}</style>
    <a className="mkt-skip" href="#mkt-main">Skip to content</a>
    <div className="mkt-nav-bar">
    <header className="mkt-nav">
      <Brand />
      <nav className="mkt-links" aria-label="Primary">
        <div className="mkt-product" ref={productRef}>
          <button type="button" aria-expanded={productOpen} aria-controls={productId} onClick={() => setProductOpen(value => !value)}>Product</button>
          {productOpen && <div id={productId} className="mkt-product-panel" role="menu">
            {FEATURE_CATEGORIES.map(category => <div key={category.id} className="mkt-product-group">
              <Link to={`${marketingPaths.features}#${category.id}`} onClick={event => openModule(event, category.id)}><strong>{category.label}</strong><span>{category.blurb}</span></Link>
              {(MENU_MODULES[category.id] || []).map(featureBySlug).filter(Boolean).map(feature => <Link key={feature.slug} to={featurePath(feature.slug)} role="menuitem" onClick={() => setProductOpen(false)}>{feature.name}</Link>)}
            </div>)}
          </div>}
        </div>
        {LINKS.map(link => <NavLink key={link.to} to={link.to}>{link.label}</NavLink>)}
      </nav>
      <div className="mkt-nav-end">
        <ThemeToggle compact />
        {login}
        {start}
        <button type="button" className="mkt-btn mkt-burger" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(true)}>
          <Menu size={18} aria-hidden="true" /> Menu
        </button>
      </div>
    </header>
    {!signedIn && <p className="mkt-trial-bar"><strong>14-day free trial.</strong> No payment required to start. <Link to={marketingPaths.signup}>Start free</Link></p>}
    {signedIn && trialEnded && <div className="ft-trial-banner is-urgent" role="status"><p><strong>{trialEnded.title}</strong> {trialEnded.preservation}</p><Link to="/subscribe">Choose a plan</Link></div>}
    {signedIn && !trialEnded && <TrialBanner subscription={subscription} isOwner={isOwner} />}
    </div>
    {open && <div className="mkt-drawer" onClick={close}>
      <div id={menuId} className="mkt-drawer-panel" role="dialog" aria-modal="true" aria-label="Menu" onClick={event => event.stopPropagation()}>
        <button type="button" className="mkt-btn" onClick={close} autoFocus><X size={18} aria-hidden="true" /> Close</button>
        <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
          {signedIn ? <Link className="mkt-btn" to="/dashboard" onClick={close}>Open FinTrack</Link> : <Link className="mkt-btn" to={marketingPaths.login} onClick={close}>Login</Link>}
          {signedIn ? null : <Link className="mkt-btn primary" to={marketingPaths.signup} onClick={close}>Start free</Link>}
        </div>
        <p className="mkt-muted" style={{ marginTop: 16 }}>Product</p>
        {FEATURE_CATEGORIES.map(category => <Link key={category.id} to={`${marketingPaths.features}#${category.id}`} onClick={event => openModule(event, category.id)}>{category.label}</Link>)}
        {LINKS.map(link => <Link key={link.to} to={link.to} onClick={close}>{link.label}</Link>)}
        <Link to={marketingPaths.how} onClick={close}>How it works</Link>
        <Link to={marketingPaths.about} onClick={close}>About</Link>
        <Link to={marketingPaths.founder} onClick={close}>Founder</Link>
        <Link to={marketingPaths.contact} onClick={close}>Contact</Link>
      </div>
    </div>}
    <main id="mkt-main">
      <Outlet context={{ signedIn }} />
    </main>
    <footer className="mkt-footer">
      <div className="mkt-wrap mkt-footer-grid">
      <div>
        <Brand />
        <p>Accounting, finance, collections, chit funds, and AI in one login. Suggestions wait until you confirm.</p>
      </div>
      <div>
        <h2>Product</h2>
        <Link to="/features/accounts-overview">Accounting</Link>
        <Link to="/features/daily-finance">Finance</Link>
        <Link to="/features/auction-chit">Chit Funds</Link>
        <Link to="/features/cashbook">Cashbook</Link>
        <Link to="/features/ask-the-books">AI insights</Link>
      </div>
      <div>
        <h2>Company</h2>
        <Link to={marketingPaths.solutions}>Solutions</Link>
        <Link to={marketingPaths.how}>How it works</Link>
        <Link to={`${marketingPaths.how}#install`}>Install the app</Link>
        <Link to={marketingPaths.security}>Security</Link>
        <Link to={marketingPaths.about}>About</Link>
        <Link to={marketingPaths.founder}>Founder</Link>
        <Link to={marketingPaths.contact}>Contact</Link>
      </div>
      <div>
        <h2>Access</h2>
        <Link to={signedIn ? "/dashboard" : marketingPaths.login}>{signedIn ? "Open FinTrack" : "Login"}</Link>
        <Link to={marketingPaths.pricing}>Pricing</Link>
        <Link to="/?view=privacy">Privacy</Link>
        <Link to="/?view=terms">Terms</Link>
      </div>
      </div>
    </footer>
  </div>;
}
