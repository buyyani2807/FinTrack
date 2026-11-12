import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { MODULE_PRODUCT_LIST, priceForPeriod, priceForProduct } from "../commercial/moduleProducts.js";
import { LEGAL_PAGES } from "../legal/content.js";
import { SOLUTIONS, featureBySlug } from "./catalog.js";
import { featurePath, marketingPaths } from "./paths.js";
import { InstallGuide } from "./InstallGuide.jsx";
import { ProductCta } from "./ProductCta.jsx";
import { ProductPreview } from "./ProductPreview.jsx";
import { FeatureIcon } from "./icons.jsx";

function PageTitle({ title }) {
  useEffect(() => { document.title = title; }, [title]);
  return null;
}

export function SolutionsPage() {
  return <RevealProvider intent="content">
  <section className="mkt-section">
    <PageTitle title="MyFinTracker solutions" />
    <Reveal>
      <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Solutions</p>
      <h1>One platform, for the work you already do.</h1>
      <p className="mkt-lead">Finance businesses, chit operators, shops, traders, service companies, and small and medium businesses. Each link opens a module that is in MyFinTracker today.</p>
    </Reveal>
    <Reveal className="mkt-grid two">
      {SOLUTIONS.map(item => <article key={item.title} className="mkt-card">
        <h2>{item.title}</h2>
        <p>{item.text}</p>
        <div className="mkt-chip-row">{item.features.map(slug => {
          const feature = featureBySlug(slug);
          return feature ? <Link key={slug} className="mkt-chip" to={featurePath(slug)}>{feature.name}</Link> : null;
        })}</div>
      </article>)}
    </Reveal>
  </section>
  <PageClose />
  </RevealProvider>;
}

const STEPS = [
  { title: "Open one workspace", text: "Owner sign-in opens the business workspace, or create the business account when signup is open. A CA uses the same Owner sign-in for assigned Accounts companies only. A collection agent, a customer, and a chit member each sign in on the same screen with their own ID and PIN." },
  { title: "Record the work", text: "Add daily or monthly customers, enroll a chit scheme, or post a voucher on the company you have open. Scan a supplier bill from a photo or a PDF, keep the bill as proof on the expense, and review the draft before you save." },
  { title: "Review what MyFinTracker highlights", text: "Insights, unusual days, bill drafts, stock that may run out or expire, till alerts, and bank suggestions are there to read. You record the payment, accept the match, or save the voucher." },
  { title: "Share only when you mean to", text: "Download a receipt or statement, or open WhatsApp with a draft. The message is sent when you send it. Portals show a customer or member their own records." },
  { title: "Keep a copy", text: "The owner can back up the whole workspace and restore it. Nightly copies run at midnight India time and are kept for 14 days." },
];

export function HowItWorksPage() {
  return <RevealProvider intent="content">
    <section className="mkt-section">
      <PageTitle title="How MyFinTracker works" />
      <Reveal>
        <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>How it works</p>
        <h1>You stay in control of every record.</h1>
        <p className="mkt-lead">MyFinTracker organises the workspace and suggests a next look. Posting, bidding results, and messages wait for a person.</p>
      </Reveal>
      <Reveal className="mkt-grid two mkt-steps">
        {STEPS.map(step => <article key={step.title} className="mkt-card mkt-step">
          <h2>{step.title}</h2>
          <p>{step.text}</p>
        </article>)}
      </Reveal>
      <Reveal className="mkt-cta-row"><ProductCta primary /><Link className="mkt-btn" to={marketingPaths.features}>Explore features</Link></Reveal>
    </section>
    <InstallGuide />
  </RevealProvider>;
}

function PriceCard({ product, period, index }) {
  const price = priceForProduct(product, period);
  const yearly = period === "annual";
  return <Reveal as="article" className="pc-card" index={index % 2}>
    <header className="pc-head">
      <h2>{product.name}</h2>
      <p className="pc-amount"><strong>{price.baseLabel}</strong><span>{yearly ? "/ year" : "/ month"} + GST</span></p>
    </header>
    <p className="pc-desc">{product.description}</p>
    <div className="pc-includes">
      <p className="pc-label">Includes</p>
      <ul>
        {product.includes.map(item => <li key={item}><span aria-hidden="true"><Check size={15} strokeWidth={2.5} /></span>{item}</li>)}
      </ul>
    </div>
  </Reveal>;
}

export function PricingPage() {
  const [period, setPeriod] = useState("monthly");
  useEffect(() => { document.title = "Pricing — MyFinTracker"; }, []);
  const yearly = period === "annual";
  return <RevealProvider intent="content"><div className="hm-home fx fx-pricing">
    <section className="fx-sec hm-flip">
      <div className="mkt-wrap">
        <header className="fx-head">
          <Reveal as="p" className="fx-eyebrow">Pricing</Reveal>
          <Reveal as="h1" index={1}>Pay for the modules you need.</Reveal>
        </header>
        <div className="fx-segment sec-bill" role="tablist" aria-label="Billing period">
          <button type="button" role="tab" aria-selected={!yearly} onClick={() => setPeriod("monthly")}>Monthly</button>
          <button type="button" role="tab" aria-selected={yearly} onClick={() => setPeriod("annual")}>Yearly</button>
        </div>
        <div className="sec-modules">
          {MODULE_PRODUCT_LIST.map((product, index) => <PriceCard key={product.key} product={product} period={period} index={index} />)}
        </div>
        <div className="sec-plan-end">
          <div className="mkt-cta-row">
            <ProductCta primary label="Start free trial" />
            <Link className="mkt-btn" to={marketingPaths.contact}>Request a demo</Link>
          </div>
          <p className="sec-plan-note">A new workspace includes 14 days with every module open. Signing up does not charge a card. After the trial, unlock only what you need. Your records stay.</p>
        </div>
      </div>
    </section>
  </div></RevealProvider>;
}

export function PageClose() {
  const monthly = priceForPeriod("monthly");
  return <section className="mkt-band">
    <Reveal className="mkt-wrap">
      <h2>Start free, then unlock modules.</h2>
      <p>
        A 14-day trial opens the full workspace. After that, each module is {monthly.baseLabel} + GST {monthly.gstPercentLabel} per month
        (or yearly). Start free does not charge a card.
      </p>
      <div className="mkt-cta-row"><ProductCta primary /><Link className="mkt-btn light" to={marketingPaths.contact}>Talk to us</Link></div>
    </Reveal>
  </section>;
}

const ABOUT_PRINCIPLES = [
  { icon: "Sparkles", title: "You confirm every record", text: "Ask Finny, Tell Finny, bill scanning, and AI Review draft and suggest. Nothing is posted, sent, or imported until you save it." },
  { icon: "Lock", title: "Each person sees only their part", text: "The owner, a collection agent, a finance customer, and a chit member each sign in separately and see only what is theirs." },
  { icon: "Landmark", title: "Built for how Indian businesses work", text: "An April to March financial year, GST preparation for your CA, rupee amounts, daily and monthly collections, and chit funds." },
  { icon: "WalletCards", title: "Modules you choose", text: "₹498 + GST 18% per standard module each month (₹5,976 + GST / year). Accounts + POS is ₹598 + GST. Unlock after the free trial." },
];

const ABOUT_SIGN_INS = [
  { icon: "LayoutDashboard", title: "Financier", text: "The owner workspace: dashboard, company books, schemes, staff, and settings.", to: "dashboard" },
  { icon: "Users", title: "Collection agent", text: "An agent ID and PIN open only the accounts and routes you assign.", to: "agent-portal" },
  { icon: "UserRound", title: "Customer", text: "A portal ID and PIN show one finance customer their own loan and history.", to: "customer-portals" },
  { icon: "Ticket", title: "Chit member", text: "A member sees their own ticket and payments, and bids when the auction is open.", to: "member-portals" },
];

export function AboutPage() {
  return <RevealProvider intent="landing">
  <PageTitle title="About MyFinTracker" />
  <section className="mkt-hero mkt-tint">
    <div className="mkt-wrap mkt-hero-copy">
      <Reveal as="p" className="mkt-kicker">About MyFinTracker</Reveal>
      <Reveal as="h1" index={1}>One login for the books, the collections, and the chit.</Reveal>
      <Reveal as="p" index={2}>Many finance businesses, chit fund operators, and traders keep the accounts in one place, collections in a notebook, and customers in a spreadsheet or on WhatsApp. MyFinTracker puts that work in one workspace that opens on a laptop and installs on iPhone and Android.</Reveal>
    </div>
  </section>

  <section className="mkt-section">
    <div className="mkt-wrap">
      <div className="mkt-section-head"><Reveal as="h2">What MyFinTracker stands for</Reveal></div>
      <div className="mkt-grid four">
        {ABOUT_PRINCIPLES.map((item, index) => <Reveal as="article" key={item.title} className="mkt-card" index={index % 4}>
          <div className="mkt-icon"><FeatureIcon name={item.icon} /></div>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </Reveal>)}
      </div>
    </div>
  </section>

  <section className="mkt-section mkt-tint">
    <div className="mkt-wrap">
      <div className="mkt-section-head">
        <Reveal as="h2">Who uses MyFinTracker</Reveal>
        <Reveal as="p" className="mkt-lead" index={1}>Each business opens the modules it needs. The rest stay in the same login for later.</Reveal>
      </div>
      <div className="mkt-grid three">
        {SOLUTIONS.map((item, index) => <Reveal as="article" key={item.title} className="mkt-card" index={index % 3}>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </Reveal>)}
        <Reveal as="article" className="mkt-card" index={SOLUTIONS.length % 3}>
          <h3>Moving from Tally, Zoho Books, or Excel</h3>
          <p>Upload your old books. MyFinTracker maps the ledgers and parties and shows you what needs a decision before anything is imported.</p>
          <Link className="mkt-text-link" to={featurePath("ai-migration")}>How migration works</Link>
        </Reveal>
      </div>
      <Reveal className="mkt-cta-row"><Link className="mkt-btn" to={marketingPaths.solutions}>See solutions</Link></Reveal>
    </div>
  </section>

  <section className="mkt-section">
    <div className="mkt-wrap mkt-split mkt-about-signins">
      <div>
        <Reveal as="h2">Four sign-ins, each to its own part</Reveal>
        <Reveal as="p" className="mkt-lead" index={1}>Everyone uses the same sign-in screen, but each role opens a separate view. Giving a collector access does not open the owner workspace.</Reveal>
        <div className="mkt-grid two">
          {ABOUT_SIGN_INS.map((item, index) => <Reveal as={Link} key={item.title} className="mkt-card" to={featurePath(item.to)} index={index % 2}>
            <div className="mkt-icon"><FeatureIcon name={item.icon} /></div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </Reveal>)}
        </div>
        <Reveal className="mkt-cta-row"><Link className="mkt-text-link" to={marketingPaths.security}>Read the access controls</Link></Reveal>
      </div>
      <ProductPreview scene="portals" />
    </div>
  </section>

  <PageClose />
  </RevealProvider>;
}

export function FounderPage() {
  return <RevealProvider intent="content">
  <section className="mkt-section">
    <PageTitle title="Sudheer Kumar Buyyani, CEO and Founder — MyFinTracker" />
    <Reveal>
      <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>CEO and Founder</p>
      <h1>Sudheer Kumar Buyyani</h1>
      <p className="mkt-lead">Sudheer founded MyFinTracker so a business can keep accounting, collections, customers, and chit funds in one workspace.</p>
    </Reveal>
    <Reveal as="article" className="mkt-profile">
      <div className="mkt-profile-photo">
        <img src="/founder/sudheer-kumar-buyyani.jpg" alt="Sudheer Kumar Buyyani, CEO and Founder of MyFinTracker" width="888" height="1024" />
      </div>
      <div className="mkt-grid two">
        <article className="mkt-card">
          <h2>Experience</h2>
          <p>Twenty years in IT across the United States, Ireland, and India — Database Administrator, Cloud Architect, and DevOps Engineer at multinational companies. As a Cloud Architect, he designed and implemented ERP systems and ecommerce websites on Amazon Web Services (AWS), Microsoft Azure, Google Cloud Platform (GCP), and Oracle Cloud Infrastructure (OCI).</p>
        </article>
        <article className="mkt-card">
          <h2>Education</h2>
          <p>Master’s degree in Management Information Systems from UCD Michael Smurfit Graduate Business School. The Financial Times ranks the school 23rd among European business schools for 2025, its tenth year in that top 30. The school holds the triple crown of AACSB, EQUIS, and AMBA accreditation.</p>
        </article>
      </div>
    </Reveal>
  </section>
  <PageClose />
  </RevealProvider>;
}

function LegalDoc({ view }) {
  const page = LEGAL_PAGES[view];
  if (!page) return null;
  return <RevealProvider intent="content">
    <section className="mkt-section">
      <PageTitle title={`${page.title} — MyFinTracker`} />
      <Reveal>
        <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Legal</p>
        <h1>{page.title}</h1>
        <p className="mkt-lead">Last updated {page.updated}.</p>
      </Reveal>
      <div className="mkt-legal">
        {page.sections.map(section => <Reveal as="article" key={section.heading} className="mkt-card">
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </Reveal>)}
      </div>
    </section>
    <PageClose />
  </RevealProvider>;
}

export function PrivacyPage() {
  return <LegalDoc view="privacy" />;
}

export function TermsPage() {
  return <LegalDoc view="terms" />;
}

export function ContactPage() {
  const [sent, setSent] = useState(false);
  return <RevealProvider intent="content"><section className="mkt-section">
    <PageTitle title="Contact MyFinTracker" />
    <Reveal>
      <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Contact</p>
      <h1>Request a demo.</h1>
      <p className="mkt-lead">Tell us the business and what you want to see. This local preview keeps the note on the page only. It does not email anyone and it does not create an account.</p>
    </Reveal>
    <Reveal className="mkt-detail">
      <form className="mkt-card mkt-form" onSubmit={event => { event.preventDefault(); setSent(true); }}>
        <label>Your name<input name="name" required autoComplete="name" /></label>
        <label>Business<input name="business" required autoComplete="organization" /></label>
        <label>Phone<input name="phone" required autoComplete="tel" inputMode="tel" /></label>
        <label>What should the demo cover?<textarea name="message" required rows={4} /></label>
        <button className="mkt-btn primary" type="submit">Save this request on this page</button>
        {sent && <p className="mkt-note" role="status">Saved on this screen only. Nothing was sent, and the note is gone if you leave the page.</p>}
      </form>
      <article className="mkt-card">
        <h2>Prefer to sign in?</h2>
        <p>Login opens the existing MyFinTracker authentication screen, including financier, collection agent, customer, and chit member.</p>
        <div className="mkt-cta-row"><Link className="mkt-btn primary" to={marketingPaths.login}>Login</Link></div>
      </article>
    </Reveal>
  </section></RevealProvider>;
}
