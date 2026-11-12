import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Check, ExternalLink, X } from "lucide-react";
import { APP_MODULES, MODULE_FEATURES, featureBySlug } from "./catalog.js";
import { FeatureIcon } from "./icons.jsx";
import { ModulePartsContext } from "./moduleParts.js";
import { featurePath } from "./paths.js";
import { ProductCta } from "./ProductCta.jsx";
import { ProductPreview, sceneForFeature } from "./ProductPreview.jsx";

// Wraps a module overview page. A feature opened from the page shows in a side panel on the same page.
// The open part lives in the URL (?part=slug), so it can be shared and the Back button closes it.
export function ModuleParts({ module, children }) {
  const [params, setParams] = useSearchParams();
  const slug = params.get("part");
  const feature = slug ? featureBySlug(slug) : null;
  const opener = useRef(null);

  const open = useCallback((next, from) => {
    if (from) opener.current = from;
    setParams(current => {
      const nextParams = new URLSearchParams(current);
      nextParams.set("part", next);
      return nextParams;
    // Moving between parts inside an open panel replaces the history entry, so Back closes the panel.
    }, { replace: params.has("part"), preventScrollReset: true });
  }, [params, setParams]);

  const close = useCallback(() => {
    setParams(current => {
      const nextParams = new URLSearchParams(current);
      nextParams.delete("part");
      return nextParams;
    }, { preventScrollReset: true });
    const target = opener.current;
    opener.current = null;
    requestAnimationFrame(() => target?.focus?.());
  }, [setParams]);

  const value = useMemo(() => ({ open }), [open]);
  return <ModulePartsContext.Provider value={value}>
    {children}
    {feature ? <PartPanel module={module} feature={feature} onOpen={open} onClose={close} /> : null}
  </ModulePartsContext.Provider>;
}

function PartPanel({ module, feature, onOpen, onClose }) {
  const sheet = useRef(null);
  const closeButton = useRef(null);
  const body = useRef(null);
  const label = APP_MODULES.find(item => item.slug === module)?.label || "";
  const parts = (MODULE_FEATURES[module] || []).map(featureBySlug).filter(Boolean);
  const index = parts.findIndex(item => item.slug === feature.slug);
  const prev = index > 0 ? parts[index - 1] : null;
  const next = index >= 0 && index < parts.length - 1 ? parts[index + 1] : null;

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = previous; };
  }, []);

  useEffect(() => {
    closeButton.current?.focus();
    body.current?.scrollTo(0, 0);
  }, [feature.slug]);

  useEffect(() => {
    const onKey = event => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !sheet.current) return;
      const focusable = [...sheet.current.querySelectorAll("a[href], button:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div className="fx-sheet-layer">
    <div className="fx-sheet-backdrop" onClick={onClose} aria-hidden="true" />
    <aside className="fx-sheet" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="fx-sheet-title">
      <header className="fx-sheet-head">
        <span className="fx-sheet-icon" aria-hidden="true"><FeatureIcon name={feature.icon} size={20} /></span>
        <div className="fx-sheet-heading">
          <p>{label}{index >= 0 ? ` · ${index + 1} of ${parts.length}` : ""}</p>
          <h2 id="fx-sheet-title">{feature.name}</h2>
        </div>
        <button type="button" className="fx-sheet-close" ref={closeButton} onClick={onClose} aria-label="Close"><X size={20} aria-hidden="true" /></button>
      </header>

      <div className="fx-sheet-body" ref={body}>
        <p className="fx-sheet-lead">{feature.summary}</p>
        {sceneForFeature(feature) ? <div className="fx-sheet-shot"><ProductPreview scene={sceneForFeature(feature)} /></div> : null}

        <h3>How it works</h3>
        <ol className="fx-sheet-steps">
          {feature.how.map((step, i) => <li key={step}><span aria-hidden="true">{i + 1}</span>{step}</li>)}
        </ol>

        <h3>What’s included</h3>
        <ul className="fx-sheet-checks">
          {feature.capabilities.map(item => <li key={item}><Check size={14} strokeWidth={3} aria-hidden="true" />{item}</li>)}
        </ul>

        <h3>Why it matters</h3>
        <p className="fx-sheet-problem">{feature.problem}</p>
        <ul className="fx-sheet-checks">
          {feature.benefits.map(item => <li key={item}><Check size={14} strokeWidth={3} aria-hidden="true" />{item}</li>)}
        </ul>

        <Link className="fx-sheet-full" to={featurePath(feature.slug)}>Open the full {feature.name} page <ExternalLink size={14} aria-hidden="true" /></Link>
      </div>

      <footer className="fx-sheet-foot">
        <div className="fx-sheet-steps-nav">
          <button type="button" disabled={!prev} onClick={() => prev && onOpen(prev.slug)} aria-label={prev ? `Previous: ${prev.name}` : "No previous part"}><ArrowLeft size={18} aria-hidden="true" /></button>
          <button type="button" disabled={!next} onClick={() => next && onOpen(next.slug)} aria-label={next ? `Next: ${next.name}` : "No next part"}>
            {next ? <span>{next.name}</span> : null}<ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <ProductCta appPath={feature.appPath} primary label="Start free trial" />
      </footer>
    </aside>
  </div>;
}
