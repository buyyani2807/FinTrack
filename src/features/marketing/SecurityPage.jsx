import { useEffect } from "react";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { SECURITY_POINTS, SECURITY_TRUST } from "./catalog.js";
import { FeatureIcon } from "./icons.jsx";
import { ModuleClosing } from "./ModuleKit.jsx";

export function SecurityPage() {
  useEffect(() => { document.title = "Security — MyFinTracker"; }, []);
  return <RevealProvider intent="content"><div className="hm-home fx fx-security">
    <section className="fx-sec hm-flip">
      <div className="mkt-wrap">
        <header className="fx-head">
          <Reveal as="p" className="fx-eyebrow">Security</Reveal>
          <Reveal as="h1" index={1}>Access, isolation, and review.</Reveal>
        </header>
        <div className="sec-points">
          {SECURITY_POINTS.map((point, index) => <Reveal as="article" key={point.title} className="sec-card" index={index % 2}>
            <h2>{point.title}</h2>
            <p>{point.text}</p>
          </Reveal>)}
        </div>
      </div>
    </section>
    <section className="fx-sec" aria-labelledby="sec-trust-title">
      <div className="mkt-wrap">
        <header className="fx-head">
          <Reveal as="p" id="sec-trust-title" className="fx-eyebrow">Security &amp; trust</Reveal>
        </header>
        <div className="sec-trust">
          {SECURITY_TRUST.map((point, index) => <Reveal as="article" key={point.title} className="sec-card" index={index % 4}>
            <span className="sec-icon"><FeatureIcon name={point.icon} /></span>
            <h2>{point.title}</h2>
            <p>{point.text}</p>
          </Reveal>)}
        </div>
      </div>
    </section>
    <ModuleClosing
      title="Each login opens only its own part."
      points={["A sign-in for each role", "Records stay in the workspace", "An audit trail you can review"]}
    />
  </div></RevealProvider>;
}
