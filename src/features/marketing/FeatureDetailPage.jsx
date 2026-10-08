import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { featureBySlug, featuresInCategory, relatedFeatures } from "./catalog.js";
import { FeatureIcon } from "./icons.jsx";
import { featurePath, marketingPaths } from "./paths.js";
import { ProductCta } from "./ProductCta.jsx";
import { ProductPreview, sceneForFeature } from "./ProductPreview.jsx";

export function FeatureDetailPage() {
  const { slug } = useParams();
  const feature = featureBySlug(slug);
  useEffect(() => { document.title = feature ? `${feature.name} — FinTrack` : "Feature — FinTrack"; }, [feature]);
  if (!feature) {
    return <div className="mkt-empty">
      <h1>That feature is not on this site.</h1>
      <p className="mkt-lead">The list only includes modules that exist in FinTrack.</p>
      <Link className="mkt-btn" to={marketingPaths.features}>Back to features</Link>
    </div>;
  }
  const related = relatedFeatures(feature);
  return <>
    <header className="mkt-page-hero">
      <div className="mkt-wrap">
        <p className="mkt-kicker"><FeatureIcon name={feature.icon} size={16} /> {feature.name}</p>
        <h1>{feature.summary}</h1>
        {feature.advisory && <p className="mkt-note">Advisory. This answer lives in Ask FinTrack. It does not write a forecast into the books.</p>}
      </div>
    </header>
    {feature.sections?.length > 0 && <section className="mkt-section mkt-tint">
      <div className="mkt-wrap">
        <div className="mkt-grid three">
          {feature.sections.map(section => <article key={section.title} className="mkt-card">
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </article>)}
        </div>
      </div>
    </section>}
    <section className="mkt-section">
      <div className="mkt-wrap mkt-detail">
      <div>
        <article className="mkt-card">
          <h2>The problem</h2>
          <p>{feature.problem}</p>
        </article>
        <article className="mkt-card" style={{ marginTop: 16 }}>
          <h2>How it works</h2>
          <ol className="mkt-list">{feature.how.map(step => <li key={step}>{step}</li>)}</ol>
        </article>
        <article className="mkt-card" style={{ marginTop: 16 }}>
          <h2>Key capabilities</h2>
          <ul className="mkt-list">{feature.capabilities.map(item => <li key={item}>{item}</li>)}</ul>
        </article>
        <article className="mkt-card" style={{ marginTop: 16 }}>
          <h2>What you gain</h2>
          <ul className="mkt-list">{feature.benefits.map(item => <li key={item}>{item}</li>)}</ul>
        </article>
      </div>
      <div>
        <ProductPreview scene={sceneForFeature(feature)} />
        <div className="mkt-cta-row">
          <ProductCta appPath={feature.appPath} primary detail />
          <Link className="mkt-btn" to={marketingPaths.contact}>Request a demo</Link>
        </div>
        <article className="mkt-card" style={{ marginTop: 16 }}>
          <h2>Related</h2>
          {related.map(item => <Link key={item.slug} to={featurePath(item.slug)} style={{ display: "block", marginTop: 10 }}>{item.name}</Link>)}
        </article>
      </div>
      </div>
    </section>
    {feature.slug === "accounts-overview" && <section className="mkt-section mkt-tint">
      <div className="mkt-wrap">
        <h2>Inside Accounts</h2>
        <p className="mkt-lead">These are the parts a small or medium business opens after login. Each one stays on the company you have selected.</p>
        <div className="mkt-grid three">
          {featuresInCategory("accounts").filter(item => item.slug !== "accounts-overview").map(item => <Link key={item.slug} to={featurePath(item.slug)} className="mkt-card mkt-card-link">
            <div className="mkt-icon"><FeatureIcon name={item.icon} /></div>
            <h3>{item.name}</h3>
            <p>{item.summary}</p>
          </Link>)}
        </div>
      </div>
    </section>}
  </>;
}
