import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { FEATURE_CATEGORIES, featuresInCategory } from "./catalog.js";
import { FeatureIcon } from "./icons.jsx";
import { featurePath } from "./paths.js";
import { ProductPreview } from "./ProductPreview.jsx";
import { PageClose } from "./SitePages.jsx";

const CATEGORY_SCENE = {
  finance: "finance",
  chit: "chit",
  accounts: "accounts",
  intelligence: "intelligence",
  portals: "portals",
};

export function FeaturesPage() {
  const location = useLocation();
  useEffect(() => { document.title = "FinTrack features"; }, []);
  useEffect(() => {
    const id = location.hash.replace("#", "");
    if (!id) return undefined;
    const node = document.getElementById(id);
    if (!node) return undefined;
    const frame = window.requestAnimationFrame(() => node.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);
  return <>
    <header className="mkt-page-hero">
      <div className="mkt-wrap">
        <p className="mkt-kicker">Features</p>
        <h1>Start with Accounts and AI.</h1>
        <p className="mkt-lead">Company books for small and medium businesses, then the suggestions that read those records. Collections and chit funds are in the same login.</p>
        <div className="mkt-tabs">
          {FEATURE_CATEGORIES.map(category => <a key={category.id} href={`#${category.id}`}>{category.label}</a>)}
        </div>
      </div>
    </header>
    {FEATURE_CATEGORIES.map(category => <section key={category.id} id={category.id} className="mkt-section">
      <div className="mkt-wrap">
      <div className="mkt-split mkt-cat">
        <div>
          <h2>{category.label}</h2>
          <p className="mkt-lead">{category.blurb}</p>
        </div>
        <ProductPreview scene={CATEGORY_SCENE[category.id]} />
      </div>
      <div className="mkt-grid three">
        {featuresInCategory(category.id).map(feature => <article key={feature.slug} className="mkt-card">
          <div className="mkt-icon"><FeatureIcon name={feature.icon} /></div>
          <h3>{feature.name}</h3>
          <p>{feature.summary}</p>
          <Link className="mkt-text-link" to={featurePath(feature.slug)}>Read {feature.name}</Link>
        </article>)}
      </div>
      </div>
    </section>)}
    <PageClose />
  </>;
}
