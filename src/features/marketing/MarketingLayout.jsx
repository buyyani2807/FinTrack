import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router";
import { ArrowRight, BookOpen, Building2, ChevronDown, Gift, House, LayoutGrid, Menu, ShieldCheck, Tag, X } from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle.jsx";
import { FEATURE_CATEGORIES, featureBySlug } from "./catalog.js";
import marketingStyles from "./marketing.css?inline";
import { featurePath, marketingPaths } from "./paths.js";

const LINKS = [
  { to: marketingPaths.home, label: "Home", icon: House, end: true },
  { to: marketingPaths.features, label: "Features", icon: LayoutGrid },
  { to: marketingPaths.solutions, label: "Solutions", icon: Building2 },
  { to: marketingPaths.security, label: "Security", icon: ShieldCheck },
  { to: marketingPaths.pricing, label: "Pricing", icon: Tag },
  { to: marketingPaths.resources, label: "Resources", icon: BookOpen },
];

function NavIcon({ item, size = 15 }) {
  const Icon = item.icon;
  return <Icon size={size} aria-hidden="true" />;
}

const MENU_MODULES = {
  accounts: ["accounts-overview", "vouchers", "receivables", "inventory", "gst-preparation", "bank-reconciliation"],
  intelligence: ["ask-fintrack", "ai-review", "forecasting", "month-end-readiness", "bank-matching", "gst-review"],
};

const COMPANY_LINKS = [
  { to: marketingPaths.how, label: "How it works" },
  { to: marketingPaths.about, label: "About" },
  { to: marketingPaths.founder, label: "Founder" },
  { to: marketingPaths.contact, label: "Contact" },
];

const TRIAL_BAR_KEY = "fintrack-trial-bar-dismissed";

function trialBarDismissed() {
  try {
    return localStorage.getItem(TRIAL_BAR_KEY) === "1";
  } catch {
    return false;
  }
}

function TrialBar() {
  const [dismissed, setDismissed] = useState(trialBarDismissed);
  if (dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(TRIAL_BAR_KEY, "1"); } catch { /* private mode: hide for this visit */ }
  };
  return <div className="mkt-trial-bar" role="region" aria-label="Free trial">
    <Link className="mkt-trial-link" to={marketingPaths.signup}>
      <span className="mkt-trial-icon" aria-hidden="true"><Gift size={14} /></span>
      <span className="mkt-trial-text">
        <strong>14-day free trial</strong>
        <span className="mkt-trial-detail">Every module included, no payment to start</span>
        <span className="mkt-trial-price">Then ₹499 a month</span>
      </span>
      <span className="mkt-trial-cta">Start free <ArrowRight size={14} aria-hidden="true" /></span>
    </Link>
    <button type="button" className="mkt-trial-close" aria-label="Dismiss the free trial message" onClick={dismiss}>
      <X size={16} aria-hidden="true" />
    </button>
  </div>;
}

function Brand({ onClick }) {
  return <Link to={marketingPaths.home} className="mkt-brand" aria-label="FinTrack home" onClick={onClick}>FIN<span>Track</span></Link>;
}

export function MarketingLayout() {
  const { signedIn = false } = useOutletContext() || {};
  const [open, setOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [drawerFeaturesOpen, setDrawerFeaturesOpen] = useState(false);
  const menuId = useId();
  const productId = useId();
  const drawerFeaturesId = useId();
  const productRef = useRef(null);
  const productPanelRef = useRef(null);
  const productTapOpens = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const onFeaturesPage = location.pathname === marketingPaths.features || location.pathname.startsWith(`${marketingPaths.features}/`);
  const close = () => setOpen(false);
  const openDrawer = () => {
    setDrawerFeaturesOpen(onFeaturesPage);
    setOpen(true);
  };
  // Touch has no hover: the first tap on Features opens the menu, a second tap opens the page.
  const onFeaturesPointerDown = event => { productTapOpens.current = event.pointerType !== "mouse" && !productOpen; };
  const onFeaturesClick = event => {
    if (!productTapOpens.current) return;
    productTapOpens.current = false;
    event.preventDefault();
    setProductOpen(true);
  };
  const openModule = (event, id) => {
    setProductOpen(false);
    close();
    const node = document.getElementById(id);
    if (!node) return;
    event.preventDefault();
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    navigate({ pathname: marketingPaths.features, hash: id });
  };
  const isCurrentCategory = id => location.pathname === marketingPaths.features && location.hash === `#${id}`;
  const onProductBlur = event => {
    if (!productRef.current?.contains(event.relatedTarget)) setProductOpen(false);
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
  useEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = previous; };
  }, [open]);
  useEffect(() => {
    const panel = productPanelRef.current;
    const current = panel?.querySelector("[aria-current]");
    if (current) panel.scrollTop = current.offsetTop - (panel.clientHeight - current.offsetHeight) / 2;
  }, [productOpen]);

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
        <NavLink className="mkt-nav-item" to={marketingPaths.home} end><NavIcon item={LINKS[0]} />Home</NavLink>
        <div
          className="mkt-product"
          ref={productRef}
          onMouseEnter={() => setProductOpen(true)}
          onMouseLeave={() => setProductOpen(false)}
          onFocus={() => setProductOpen(true)}
          onBlur={onProductBlur}
        >
          <NavLink className="mkt-nav-item" to={marketingPaths.features} aria-expanded={productOpen} aria-controls={productId} onPointerDown={onFeaturesPointerDown} onClick={onFeaturesClick}><NavIcon item={LINKS[1]} />Features</NavLink>
          {productOpen && <div id={productId} ref={productPanelRef} className="mkt-product-panel">
            {FEATURE_CATEGORIES.map(category => <div key={category.id} className="mkt-product-group">
              <Link to={`${marketingPaths.features}#${category.id}`} aria-current={isCurrentCategory(category.id) ? "location" : undefined} onClick={event => openModule(event, category.id)}><strong>{category.label}</strong></Link>
              {(MENU_MODULES[category.id] || []).map(featureBySlug).filter(Boolean).map(feature => <NavLink key={feature.slug} to={featurePath(feature.slug)} onClick={() => setProductOpen(false)}>{feature.name}</NavLink>)}
            </div>)}
          </div>}
        </div>
        {LINKS.filter(link => link.to !== marketingPaths.home && link.to !== marketingPaths.features).map(link => <NavLink className="mkt-nav-item" key={link.to} to={link.to}><NavIcon item={link} />{link.label}</NavLink>)}
      </nav>
      <div className="mkt-nav-end">
        <ThemeToggle compact />
        {login}
        {signedIn ? start : null}
        <button type="button" className="mkt-burger" aria-label="Open menu" aria-expanded={open} aria-controls={menuId} onClick={openDrawer}>
          <Menu size={22} aria-hidden="true" />
        </button>
      </div>
    </header>
    {!signedIn && <TrialBar />}
    </div>
    {open && <div className="mkt-drawer" onClick={close}>
      <div id={menuId} className="mkt-drawer-panel" role="dialog" aria-modal="true" aria-label="Menu" onClick={event => event.stopPropagation()}>
        <div className="mkt-drawer-head">
          <Brand onClick={close} />
          <button type="button" className="mkt-drawer-close" aria-label="Close menu" onClick={close} autoFocus><X size={20} aria-hidden="true" /></button>
        </div>
        <nav className="mkt-drawer-body" aria-label="Menu">
          <NavLink className="mkt-drawer-link" to={marketingPaths.home} end onClick={close}><span className="mkt-nav-label"><NavIcon item={LINKS[0]} size={18} />Home</span></NavLink>
          <button
            type="button"
            className={`mkt-drawer-link mkt-drawer-toggle${onFeaturesPage ? " is-current" : ""}`}
            aria-expanded={drawerFeaturesOpen}
            aria-controls={drawerFeaturesId}
            onClick={() => setDrawerFeaturesOpen(value => !value)}
          >
            <span className="mkt-nav-label"><NavIcon item={LINKS[1]} size={18} />Features</span> <ChevronDown size={18} aria-hidden="true" />
          </button>
          <div id={drawerFeaturesId} className="mkt-drawer-sub" data-state={drawerFeaturesOpen ? "open" : "closed"} inert={!drawerFeaturesOpen}>
            <div>
              <Link to={marketingPaths.features} aria-current={location.pathname === marketingPaths.features && !location.hash ? "page" : undefined} onClick={close}>All features</Link>
              {FEATURE_CATEGORIES.map(category => <div key={category.id} className="mkt-drawer-cat">
                <Link to={`${marketingPaths.features}#${category.id}`} aria-current={isCurrentCategory(category.id) ? "location" : undefined} onClick={event => openModule(event, category.id)}>{category.label}</Link>
                {(MENU_MODULES[category.id] || []).map(featureBySlug).filter(Boolean).map(feature => <NavLink key={feature.slug} className="mkt-drawer-module" to={featurePath(feature.slug)} onClick={close}>{feature.name}</NavLink>)}
              </div>)}
            </div>
          </div>
          {LINKS.filter(link => link.to !== marketingPaths.home && link.to !== marketingPaths.features).map(link => <NavLink key={link.to} className="mkt-drawer-link" to={link.to} onClick={close}><span className="mkt-nav-label"><NavIcon item={link} size={18} />{link.label}</span></NavLink>)}
          <p className="mkt-drawer-label">Company</p>
          {COMPANY_LINKS.map(link => <NavLink key={link.to} className="mkt-drawer-link minor" to={link.to} onClick={close}>{link.label}</NavLink>)}
        </nav>
        <div className="mkt-drawer-foot">
          <div className="mkt-drawer-theme"><span>Appearance</span><ThemeToggle /></div>
          <div className="mkt-drawer-cta">
            {signedIn ? null : <Link className="mkt-btn" to={marketingPaths.login} onClick={close}>Login</Link>}
            {signedIn
              ? <Link className="mkt-btn primary" to="/dashboard" onClick={close}>Open FinTrack</Link>
              : <Link className="mkt-btn primary" to={marketingPaths.signup} onClick={close}>Start free</Link>}
          </div>
        </div>
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
        <Link to="/features/ask-fintrack">Ask FinTrack</Link>
        <Link to="/features/ai-review">AI Review</Link>
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
