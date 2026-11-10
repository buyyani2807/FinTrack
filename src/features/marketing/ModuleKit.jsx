import { useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/Accordion.jsx";
import { Reveal } from "../../components/ui/Reveal.jsx";
import { APP_MODULES, MODULE_FEATURES, featureBySlug, moduleForFeature } from "./catalog.js";
import { FAQ } from "./faq.js";
import { usePartLink } from "./moduleParts.js";
import { featurePath, marketingPaths } from "./paths.js";
import { ProductCta } from "./ProductCta.jsx";
import { ProductPreview } from "./ProductPreview.jsx";
import { priceForPeriod } from "../commercial/moduleProducts.js";

const MONTHLY = priceForPeriod("monthly");

// Shared parts of the Finance, Chit Fund, and Accounts pages. Styles: the "Module pages" block in marketing.css.

export function ModuleHero({ name, title, lead, appPath, scene, frameLabel }) {
  return <section className="fx-hero hm-flip">
    <div className="mkt-wrap fx-hero-copy">
      <Reveal as="p" className="fx-eyebrow">{name}</Reveal>
      <Reveal as="h1" index={1}>{title}</Reveal>
      <Reveal as="p" className="fx-lead" index={2}>{lead}</Reveal>
      <Reveal className="fx-actions" index={3}>
        <ProductCta appPath={appPath} primary label="Start free trial" />
        <Link className="mkt-btn" to={marketingPaths.contact}>Book a demo</Link>
      </Reveal>
    </div>
    <Reveal className="mkt-wrap fx-frame-wrap" index={2} duration={1.1}>
      <div className="fx-frame">
        <div className="fx-frame-bar" aria-hidden="true"><i /><i /><i /><span>{frameLabel}</span></div>
        <ProductPreview scene={scene} />
      </div>
    </Reveal>
  </section>;
}

export function SectionHead({ eyebrow, title }) {
  return <header className="fx-head">
    <Reveal as="p" className="fx-eyebrow">{eyebrow}</Reveal>
    <Reveal as="h2" index={1}>{title}</Reveal>
  </header>;
}

// A feature tile. With `slug` it links to that feature page; with only `tag` it is a picture with a label.
export function Tile({ slug, tag, size = "", title, children }) {
  const feature = slug ? featureBySlug(slug) : null;
  const openPart = usePartLink(slug);
  const className = `fx-tile${size ? ` fx-t-${size}` : ""}${slug ? "" : " is-static"}`;
  const body = <>
    <div className="fx-visual" aria-hidden="true">{children}</div>
    <div className="fx-tile-copy">
      <p className="fx-tag">{feature?.name || tag}</p>
      <h3>{title}</h3>
      {slug ? <span className="fx-more">Open <ArrowRight size={15} aria-hidden="true" /></span> : null}
    </div>
  </>;
  return slug
    ? <Reveal as={Link} to={featurePath(slug)} className={className} onClick={openPart} aria-haspopup={openPart ? "dialog" : undefined}>{body}</Reveal>
    : <Reveal as="article" className={className}>{body}</Reveal>;
}

// Tabs that swap the steps and the screen for each way of working. modes: [{ key, label, slug, scene, line }]
export function ModeSwitch({ label, modes }) {
  const [key, setKey] = useState(modes[0].key);
  const openPart = usePartLink(modes.find(item => item.key === key)?.slug);
  const tabs = useRef({});
  const mode = modes.find(item => item.key === key);
  const feature = featureBySlug(mode.slug);
  const onKeyDown = event => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const index = modes.findIndex(item => item.key === key);
    const next = modes[(index + (event.key === "ArrowRight" ? 1 : -1) + modes.length) % modes.length].key;
    setKey(next);
    tabs.current[next]?.focus();
  };
  return <div className="fx-switch">
    {modes.length > 1 ? <div className="fx-segment" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {modes.map(item => <button key={item.key} ref={node => { tabs.current[item.key] = node; }} type="button" role="tab" id={`fx-tab-${item.key}`} aria-selected={item.key === key} aria-controls="fx-mode" tabIndex={item.key === key ? 0 : -1} onClick={() => setKey(item.key)}>{item.label}</button>)}
    </div> : null}
    <div className="fx-book" id="fx-mode" {...(modes.length > 1 ? { role: "tabpanel", "aria-labelledby": `fx-tab-${key}` } : {})}>
      <div key={key} className="fx-book-copy">
        <h3>{feature.name}</h3>
        <p className="fx-book-line">{mode.line}</p>
        <ol className="fx-steps">
          {feature.how.map((step, index) => <li key={step}><span aria-hidden="true">{index + 1}</span>{step}</li>)}
        </ol>
        {mode.link === false ? null : <Link className="fx-link" to={featurePath(mode.slug)} onClick={openPart} aria-haspopup={openPart ? "dialog" : undefined}>Explore {feature.name} <ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>
      <div key={`${key}-shot`} className="fx-book-shot"><ProductPreview scene={mode.scene} /></div>
    </div>
  </div>;
}

export function ModuleFaq({ title, questions }) {
  const items = questions.map(question => FAQ.find(item => item.question === question)).filter(Boolean);
  return <section className="fx-sec">
    <div className="mkt-wrap fx-faq">
      <div>
        <Reveal as="p" className="fx-eyebrow">Questions</Reveal>
        <Reveal as="h2" index={1}>{title}</Reveal>
        <Reveal as="p" className="fx-faq-note" index={2}>Something else on your mind? <Link to={marketingPaths.contact}>Contact us</Link></Reveal>
      </div>
      <Reveal className="fx-faq-list" index={1}>
        <Accordion collapsible defaultValue="q-0">
          {items.map((item, index) => <AccordionItem key={item.question} value={`q-${index}`}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>)}
        </Accordion>
      </Reveal>
    </div>
  </section>;
}

export function ModuleClosing({ title, appPath, points }) {
  return <section className="fx-end hm-flip">
    <div className="mkt-wrap fx-end-inner">
      <Reveal as="h2">{title}</Reveal>
      <Reveal as="p" index={1}>14 days free. Every module included. No payment to start, then modules from {MONTHLY.baseLabel} + GST a month.</Reveal>
      <Reveal className="fx-actions is-center" index={2}>
        <ProductCta appPath={appPath} primary label="Start free trial" />
        <Link className="mkt-btn" to={marketingPaths.contact}>Talk to us</Link>
      </Reveal>
      <Reveal as="ul" className="fx-end-points" index={3}>
        {points.map(item => <li key={item}><Check size={14} strokeWidth={3} aria-hidden="true" />{item}</li>)}
      </Reveal>
    </div>
  </section>;
}

// At the end of a feature page that belongs to a module: the previous and next parts.
export function ModulePager({ current }) {
  const module = moduleForFeature(current);
  if (!module || module === current) return null;
  const label = APP_MODULES.find(item => item.slug === module)?.label || featureBySlug(module)?.name;
  const parts = MODULE_FEATURES[module].map(featureBySlug).filter(Boolean);
  const index = parts.findIndex(item => item.slug === current);
  const prev = parts[index - 1];
  const next = parts[index + 1];
  return <nav className="mkt-section fx-pager" aria-label={`More in ${label}`}>
    <div className="mkt-wrap fx-pager-grid">
      {prev ? <Link className="fx-pager-card" to={featurePath(prev.slug)}>
        <span className="fx-pager-dir"><ArrowLeft size={16} aria-hidden="true" /> Previous</span>
        <strong>{prev.name}</strong>
      </Link> : <Link className="fx-pager-card" to={featurePath(module)}>
        <span className="fx-pager-dir"><ArrowLeft size={16} aria-hidden="true" /> Back to</span>
        <strong>{label}</strong>
      </Link>}
      {next ? <Link className="fx-pager-card is-next" to={featurePath(next.slug)}>
        <span className="fx-pager-dir">Next <ArrowRight size={16} aria-hidden="true" /></span>
        <strong>{next.name}</strong>
      </Link> : <Link className="fx-pager-card is-next" to={featurePath(module)}>
        <span className="fx-pager-dir">Back to <ArrowRight size={16} aria-hidden="true" /></span>
        <strong>{label}</strong>
      </Link>}
    </div>
  </nav>;
}
