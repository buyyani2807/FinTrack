import { useEffect, useId, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useOutletContext } from "react-router";
import { BookOpenText, Coins, HandCoins, House, Menu, ShoppingCart, Sparkles, X } from "lucide-react";
import { APP_MODULES, moduleForFeature } from "./catalog.js";
import marketingStyles from "./marketing.css?inline";
import { OPEN_PRODUCT, PRODUCT_NAME } from "../../lib/brand.js";
import { featurePath, marketingPaths } from "./paths.js";

const MODULE_ICONS = {
  home: House,
  finance: HandCoins,
  "auction-chit": Coins,
  "accounts-overview": BookOpenText,
  "counter-pos": ShoppingCart,
  ai: Sparkles,
};

function moduleHref(item) {
  return item.to || featurePath(item.slug);
}

// "page" on a module's own page; "true" on one of its feature pages, so the parent stays highlighted.
function moduleCurrent(item, pathname) {
  const href = moduleHref(item);
  if (pathname === href) return "page";
  if (item.end) return undefined;
  const slug = pathname.startsWith("/features/") ? pathname.slice("/features/".length).split("/")[0] : null;
  return slug && moduleForFeature(slug) === item.slug ? "true" : undefined;
}

function ModuleIcon({ slug, size = 16 }) {
  const Icon = MODULE_ICONS[slug] || House;
  return <Icon size={size} aria-hidden="true" />;
}

const COMPANY_LINKS = [
  { to: marketingPaths.how, label: "How it works" },
  { to: marketingPaths.about, label: "About" },
  { to: marketingPaths.founder, label: "Founder" },
  { to: marketingPaths.contact, label: "Contact" },
];

function Brand({ onClick }) {
  return <Link to={marketingPaths.home} className="mkt-brand" aria-label={`${PRODUCT_NAME} home`} onClick={onClick}>MyFin<span>Tracker</span></Link>;
}

export function MarketingLayout() {
  const { signedIn = false } = useOutletContext() || {};
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const { pathname } = useLocation();
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = previous;
    };
  }, [open]);

  const login = signedIn
    ? <Link className="mkt-btn" to="/dashboard">{OPEN_PRODUCT}</Link>
    : <Link className="mkt-btn mkt-login-link" to={marketingPaths.login}>Login</Link>;
  const start = signedIn
    ? <Link className="mkt-btn primary" to="/dashboard">{OPEN_PRODUCT}</Link>
    : <Link className="mkt-btn primary" to={marketingPaths.signup}>Start free</Link>;

  return <div className="mkt">
    <style>{marketingStyles}</style>
    <a className="mkt-skip" href="#mkt-main">Skip to content</a>
    <div className="mkt-nav-bar">
    <header className="mkt-nav">
      <Brand />
      <nav className="mkt-links" aria-label="Primary">
        {APP_MODULES.map(item => <Link className="mkt-nav-item" key={item.slug} to={moduleHref(item)} aria-current={moduleCurrent(item, pathname)}><ModuleIcon slug={item.slug} />{item.label}</Link>)}
      </nav>
      <div className="mkt-nav-end">
        {signedIn ? null : login}
        {start}
        <button type="button" className="mkt-burger" aria-label="Open menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(true)}>
          <Menu size={22} aria-hidden="true" />
        </button>
      </div>
    </header>
    </div>
    {open && <div className="mkt-drawer" onClick={close}>
      <div id={menuId} className="mkt-drawer-panel" role="dialog" aria-modal="true" aria-label="Menu" onClick={event => event.stopPropagation()}>
        <div className="mkt-drawer-head">
          <Brand onClick={close} />
          <button type="button" className="mkt-drawer-close" aria-label="Close menu" onClick={close} autoFocus><X size={20} aria-hidden="true" /></button>
        </div>
        <nav className="mkt-drawer-body" aria-label="Menu">
          {APP_MODULES.map(item => <Link key={item.slug} className="mkt-drawer-link" to={moduleHref(item)} aria-current={moduleCurrent(item, pathname)} onClick={close}><span className="mkt-nav-label"><ModuleIcon slug={item.slug} size={18} />{item.label}</span></Link>)}
          <p className="mkt-drawer-label">Company</p>
          {COMPANY_LINKS.map(link => <NavLink key={link.to} className="mkt-drawer-link minor" to={link.to} onClick={close}>{link.label}</NavLink>)}
        </nav>
        <div className="mkt-drawer-foot">
          <div className="mkt-drawer-cta">
            {signedIn ? null : <Link className="mkt-btn" to={marketingPaths.login} onClick={close}>Login</Link>}
            {signedIn
              ? <Link className="mkt-btn primary" to="/dashboard" onClick={close}>{OPEN_PRODUCT}</Link>
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
      <div className="mkt-footer-brand">
        <Brand />
        <p>Accounting, finance, collections, chit funds, and AI in one login. Suggestions wait until you confirm.</p>
        <p className="mkt-footer-badges"><span>Web</span><span>iPhone</span><span>Android</span></p>
      </div>
      <div>
        <h2>Product</h2>
        {APP_MODULES.map(item => <Link key={item.slug} to={moduleHref(item)}>{item.label}</Link>)}
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
        <Link to={signedIn ? "/dashboard" : marketingPaths.login}>{signedIn ? OPEN_PRODUCT : "Login"}</Link>
        <Link to={marketingPaths.pricing}>Pricing</Link>
        <Link to="/?view=privacy">Privacy</Link>
        <Link to="/?view=terms">Terms</Link>
      </div>
      </div>
      <div className="mkt-wrap mkt-footer-bottom">
        <p>© {new Date().getFullYear()} {PRODUCT_NAME}. Built for finance businesses, chit fund operators, and traders in India.</p>
      </div>
    </footer>
  </div>;
}
