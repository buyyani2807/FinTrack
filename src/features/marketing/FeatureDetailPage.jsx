import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { APP_MODULES, featureBySlug, relatedFeatures } from "./catalog.js";
import { AccountsPage } from "./AccountsPage.jsx";
import { ChitPage } from "./ChitPage.jsx";
import { FinancePage } from "./FinancePage.jsx";
import { ModulePager } from "./ModuleKit.jsx";
import { PosPage } from "./PosPage.jsx";
import { FeatureIcon } from "./icons.jsx";
import { featurePath, marketingPaths } from "./paths.js";
import { ProductCta } from "./ProductCta.jsx";
import { ProductPreview, sceneForFeature } from "./ProductPreview.jsx";

export function FeatureDetailPage() {
  const { slug } = useParams();
  const feature = featureBySlug(slug);
  const moduleLabel = APP_MODULES.find(item => item.slug === feature?.slug)?.label || feature?.name;
  useEffect(() => { document.title = feature ? `${moduleLabel} — MyFinTracker` : "Feature — MyFinTracker"; }, [feature, moduleLabel]);
  if (!feature) {
    return <Reveal intent="content" className="mkt-empty">
      <h1>That feature is not on this site.</h1>
      <p className="mkt-lead">The list only includes modules that exist in MyFinTracker.</p>
      <Link className="mkt-btn" to={marketingPaths.features}>Back to features</Link>
    </Reveal>;
  }
  if (feature.slug !== slug) return <Navigate to={featurePath(feature.slug)} replace />;
  if (feature.slug === "finance") return <FinancePage feature={feature} />;
  if (feature.slug === "auction-chit") return <ChitPage feature={feature} />;
  if (feature.slug === "accounts-overview") return <AccountsPage feature={feature} />;
  if (feature.slug === "counter-pos") return <PosPage feature={feature} />;
  const related = relatedFeatures(feature);
  return <RevealProvider intent="landing">
    <header className="mkt-page-hero">
      <div className="mkt-wrap">
        <Reveal as="p" className="mkt-kicker"><FeatureIcon name={feature.icon} size={16} /> {moduleLabel}</Reveal>
        <Reveal as="h1" index={1}>{feature.summary}</Reveal>
        {feature.advisory && <Reveal as="p" className="mkt-note" index={2}>Advisory. A forecast is an estimate shown with its assumptions. It is not a guarantee, and it is never written into the books.</Reveal>}
      </div>
    </header>
    {feature.examples?.length > 0 && <section className="mkt-section">
      <div className="mkt-wrap">
        <Reveal as="h2">Questions you can ask</Reveal>
        <Reveal as="p" className="mkt-lead" index={1}>Tap one of these in the app, or type your own in similar words.</Reveal>
        <div className="mkt-grid three">
          {feature.examples.map((group, index) => <Reveal as="article" key={group.group} className="mkt-card" index={index % 3}>
            <h3>{group.group}</h3>
            <ul className="mkt-list">{group.questions.map(question => <li key={question}>{question}</li>)}</ul>
          </Reveal>)}
        </div>
      </div>
    </section>}
    {feature.sections?.length > 0 && <section className="mkt-section mkt-tint">
      <div className="mkt-wrap">
        <div className="mkt-grid three">
          {feature.sections.map((section, index) => <Reveal as="article" key={section.title} className="mkt-card" index={index % 3}>
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </Reveal>)}
        </div>
      </div>
    </section>}
    <section className="mkt-section">
      <div className="mkt-wrap mkt-detail">
      <div>
        <Reveal as="article" className="mkt-card">
          <h2>The problem</h2>
          <p>{feature.problem}</p>
        </Reveal>
        <Reveal as="article" className="mkt-card" style={{ marginTop: 16 }}>
          <h2>How it works</h2>
          <ol className="mkt-list">{feature.how.map(step => <li key={step}>{step}</li>)}</ol>
        </Reveal>
        <Reveal as="article" className="mkt-card" style={{ marginTop: 16 }}>
          <h2>Key capabilities</h2>
          <ul className="mkt-list">{feature.capabilities.map(item => <li key={item}>{item}</li>)}</ul>
        </Reveal>
        <Reveal as="article" className="mkt-card" style={{ marginTop: 16 }}>
          <h2>What you gain</h2>
          <ul className="mkt-list">{feature.benefits.map(item => <li key={item}>{item}</li>)}</ul>
        </Reveal>
      </div>
      <div>
        <Reveal index={1} duration={1.1}><ProductPreview scene={sceneForFeature(feature)} /></Reveal>
        <Reveal className="mkt-cta-row" index={2}>
          <ProductCta appPath={feature.appPath} primary detail />
          <Link className="mkt-btn" to={marketingPaths.contact}>Request a demo</Link>
        </Reveal>
        <Reveal as="article" className="mkt-card" style={{ marginTop: 16 }}>
          <h2>Related</h2>
          {related.map(item => <Link key={item.slug} to={featurePath(item.slug)} style={{ display: "block", marginTop: 10 }}>{item.name}</Link>)}
        </Reveal>
      </div>
      </div>
    </section>
    <ModulePager current={feature.slug} />
  </RevealProvider>;
}
