import { useEffect } from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowRight, Check, FileText, Info, ScanLine } from "lucide-react";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { featureBySlug, MODULE_FEATURES } from "./catalog.js";
import { FeatureIcon } from "./icons.jsx";
import { ModeSwitch, ModuleClosing, ModuleFaq, ModuleHero, SectionHead, Tile } from "./ModuleKit.jsx";
import { ModuleParts } from "./ModuleParts.jsx";
import { usePartLink } from "./moduleParts.js";
import { featurePath } from "./paths.js";

// Tiles with a picture; the rest of the AI module is listed under "Also in AI".
const TILES = ["ask-finny", "ai-bookkeeper", "bill-scanning", "forecasting", "anomaly-detection", "gst-review", "bank-matching", "month-end-readiness"];

// Sample figures: Ask Finny's answer is the homepage example; Tell Finny's draft is the one in its product screenshot.
const ASK_LINES = [
  { label: "Customer 1", detail: "2 recent misses", amount: "₹41,000" },
  { label: "Customer 2", detail: "2 recent misses", amount: "₹40,500" },
  { label: "Customer 3", detail: "2 recent misses", amount: "₹40,500" },
];
const MODES = [
  { key: "ask", label: "Ask", slug: "ask-finny", scene: "intelligence", line: "Ask in plain English. The answer comes from this workspace’s records." },
  { key: "tell", label: "Tell", slug: "ai-bookkeeper", scene: "ai-bookkeeper", line: "Write what happened in a sentence. Finny drafts the entry for you to post." },
  { key: "review", label: "Review", slug: "ai-review", scene: "ai-overview", line: "Eight reviews in one Accounts tab, each with its reason, confidence, and a link to the record." },
];

function AlsoLink({ item }) {
  const openPart = usePartLink(item.slug);
  return <Link to={featurePath(item.slug)} onClick={openPart} aria-haspopup={openPart ? "dialog" : undefined}><FeatureIcon name={item.icon} size={16} />{item.name}<ArrowRight size={14} aria-hidden="true" /></Link>;
}

export function AiPage({ feature }) {
  useEffect(() => { document.title = "AI — MyFinTracker"; }, []);
  const more = MODULE_FEATURES.ai.filter(slug => !TILES.includes(slug)).map(featureBySlug).filter(Boolean);
  return <RevealProvider intent="landing"><ModuleParts module="ai"><div className="hm-home fx">
    <ModuleHero
      name="AI"
      title="AI that reviews the books with you."
      lead="MyFinTracker reads your own records and points out what needs a look: cash that may run short, costs that rose, GST details to fix, bank lines to match, and stock to reorder. You post the voucher, approve the match, and send the message."
      appPath={feature.appPath}
      scene="ai-overview"
      frameLabel="Accounts · AI Review"
    />

    <section className="fx-sec fx-bento-sec">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Inside AI" title="Every suggestion shows its reason." />
        <div className="fx-bento">
          <Tile slug="ask-finny" size="lg" title="Ask your books the way you ask your accountant.">
            <div className="fx-card fx-qa">
              <p className="fx-qa-q">Who has not paid today?</p>
              <div className="fx-qa-a">
                <p className="fx-qa-title">Not paid today</p>
                <p className="fx-qa-sum">3 daily customers have not paid. Pending ₹1,500 of ₹1,500 expected.</p>
                <ul>
                  {ASK_LINES.map(line => <li key={line.label}><span><strong>{line.label}</strong><em>{line.detail}</em></span><b>{line.amount}</b></li>)}
                </ul>
                <p className="fx-qa-src">Source: Daily Finance · Today’s collection</p>
              </div>
            </div>
          </Tile>
          <Tile slug="ai-bookkeeper" size="wide" title="A plain sentence becomes a balanced draft. You post it.">
            <div className="fx-tell">
              <p className="fx-card fx-bubble">I bought a laptop for ₹85,000 using HDFC</p>
              <div className="fx-card fx-voucher">
                <div className="fx-voucher-head"><strong>Draft · Purchase</strong><span className="fx-pill is-on"><Check size={12} strokeWidth={3} /> Balanced</span></div>
                <div className="fx-voucher-grid">
                  <span>Ledger</span><span>Debit</span><span>Credit</span>
                  <b>Fixed Assets</b><b>₹85,000</b><b>—</b>
                  <b>HDFC Bank</b><b>—</b><b>₹85,000</b>
                </div>
              </div>
            </div>
          </Tile>
          <Tile slug="bill-scanning" title="A bill photo or PDF becomes a draft purchase.">
            <div className="fx-scan">
              <div className="fx-card fx-doc"><FileText size={18} /><i /><i /><i /><i /><span>Bill</span></div>
              <ScanLine size={22} />
              <span className="fx-card fx-chip">Draft purchase</span>
            </div>
          </Tile>
          <Tile slug="forecasting" title="Where cash may stand in 7, 30, and 60 days.">
            <div className="fx-spark fx-forecast">
              <span>Cash forecast</span>
              <svg viewBox="0 0 160 60" preserveAspectRatio="none"><polyline points="0,40 30,34 60,38 80,28" /><polyline className="is-ahead" points="80,28 110,22 135,26 160,14" /></svg>
              <small><i /> Actual <i className="is-ahead" /> Forecast</small>
            </div>
          </Tile>
          <Tile slug="anomaly-detection" title="Possible duplicates and bills above a supplier’s average.">
            <div className="fx-card fx-rows fx-flags">
              <p><AlertTriangle size={14} /> Unusual activity</p>
              <p><span>Possible duplicate payment</span></p>
              <p><span>Bill above supplier average</span></p>
              <p><span>Backdated entry</span></p>
            </div>
          </Tile>
          <Tile slug="gst-review" title="GST details to fix before you prepare the return.">
            <div className="fx-card fx-rows fx-flags">
              <p><Info size={14} /> GST review</p>
              <p><span>GSTIN is invalid</span></p>
              <p><span>HSN code missing</span></p>
              <p><span>Tax does not match the rate</span></p>
            </div>
          </Tile>
          <Tile slug="bank-matching" title="A party and ledger suggested for each bank line. You approve.">
            <div className="fx-match">
              <span className="fx-card fx-chip">HDFC · ₹12,400 in</span>
              <span className="fx-pill is-on">Likely match</span>
              <span className="fx-card fx-chip">Kumar Kirana · Receipt</span>
            </div>
          </Tile>
          <Tile slug="month-end-readiness" title="A readiness score and what is left before you lock the month.">
            <div className="fx-gauge">
              <svg viewBox="0 0 120 70"><path className="fx-gauge-track" d="M10,62 A50,50 0 0 1 110,62" /><path className="fx-gauge-value" d="M10,62 A50,50 0 0 1 100,34" /></svg>
              <strong>84%</strong>
            </div>
          </Tile>
        </div>
        <Reveal as="p" className="fx-ai-note">A forecast is shown apart from actual figures and is never posted into the books. Nothing is filed, locked, reversed, or sent by itself.</Reveal>
        <div className="fx-also">
          <Reveal as="p" className="fx-eyebrow">Also in AI</Reveal>
          <ul>
            {more.map(item => <li key={item.slug}><AlsoLink item={item} /></li>)}
          </ul>
        </div>
      </div>
    </section>

    <section className="fx-sec hm-flip">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Three ways to use it" title="Ask, tell, and review." />
        <ModeSwitch label="AI" modes={MODES} />
      </div>
    </section>

    <ModuleFaq title="AI, answered." questions={["Does it have AI?", "What is Ask Finny?", "Does the AI change my books?", "Can I move my books from Tally or Excel?"]} />
    <ModuleClosing title="Let the AI review the books with you." appPath={feature.appPath} points={["Included in the plan", "Every suggestion shows its reason", "Nothing posts until you confirm"]} />
  </div></ModuleParts></RevealProvider>;
}
