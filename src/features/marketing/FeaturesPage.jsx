import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { FEATURE_CATEGORIES, featuresInCategory } from "./catalog.js";
import { FeatureIcon } from "./icons.jsx";
import { featurePath } from "./paths.js";
import { ProductPreview } from "./ProductPreview.jsx";
import { PageClose } from "./SitePages.jsx";

const CATEGORY_SCENE = {
  finance: "finance",
  chit: "chit-scheme",
  accounts: "accounts-charts",
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
  return <RevealProvider intent="landing">
    <header className="mkt-page-hero">
      <div className="mkt-wrap">
        <Reveal as="p" className="mkt-kicker">Features</Reveal>
        <Reveal as="h1" index={1}>Start with Accounts and AI.</Reveal>
        <Reveal as="p" className="mkt-lead" index={2}>Company books for small and medium businesses, then the suggestions that read those records. Collections and chit funds are in the same login.</Reveal>
        <Reveal className="mkt-tabs" index={3}>
          {FEATURE_CATEGORIES.map(category => <a key={category.id} href={`#${category.id}`}>{category.label}</a>)}
        </Reveal>
      </div>
    </header>
    {FEATURE_CATEGORIES.map(category => <section key={category.id} id={category.id} className="mkt-section">
      <div className="mkt-wrap">
      <div className="mkt-split mkt-cat">
        <div>
          <Reveal as="h2">{category.label}</Reveal>
          <Reveal as="p" className="mkt-lead" index={1}>{category.blurb}</Reveal>
        </div>
        <Reveal index={1} duration={1.1}><ProductPreview scene={CATEGORY_SCENE[category.id]} /></Reveal>
      </div>
      <div className="mkt-grid three">
        {featuresInCategory(category.id).map((feature, index) => <Reveal as="article" key={feature.slug} className="mkt-card" index={index % 3}>
          <div className="mkt-icon"><FeatureIcon name={feature.icon} /></div>
          <h3>{feature.name}</h3>
          <p>{feature.summary}</p>
          <Link className="mkt-text-link" to={featurePath(feature.slug)}>Read {feature.name}</Link>
        </Reveal>)}
      </div>
      </div>
    </section>)}
    <PageClose />
  </RevealProvider>;
}
