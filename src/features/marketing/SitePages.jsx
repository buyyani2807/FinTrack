import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { MODULE_PRODUCT_LIST, priceForPeriod, priceForProduct } from "../commercial/moduleProducts.js";
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
  { title: "Record the work", text: "Add daily or monthly customers, enroll a chit scheme, or post a voucher on the company you have open. Scan a supplier bill from a photo or a PDF and review the draft before you save." },
  { title: "Review what MyFinTracker highlights", text: "Insights, unusual days, bill drafts, and bank suggestions are there to read. You record the payment, accept the match, or save the voucher." },
  { title: "Share only when you mean to", text: "Download a receipt or statement, or open WhatsApp with a draft. The message is sent when you send it. Portals show a customer or member their own records." },
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

export function PricingPage() {
  const monthly = priceForPeriod("monthly");
  const annual = priceForPeriod("annual");
  const posMonthly = priceForProduct("accounts_pos", "monthly");
  return <RevealProvider intent="landing"><section className="mkt-section">
    <PageTitle title="MyFinTracker pricing" />
    <Reveal as="p" className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Pricing</Reveal>
    <Reveal as="h1" index={1}>Pay for the modules you need.</Reveal>
    <Reveal as="p" className="mkt-lead" index={2}>
      Finance, Chit Fund, and Accounts are {monthly.baseLabel} + GST {monthly.gstPercentLabel} ({monthly.totalLabel} per month),
      or {annual.baseLabel} + GST {annual.gstPercentLabel} ({annual.totalLabel} per year).
      Accounts + POS is {posMonthly.baseLabel} + GST ({posMonthly.totalLabel} / month) — ₹100 more for Counter.
      There is no lifetime plan. Unlock after a 14-day free trial of the full workspace.
    </Reveal>
    <Reveal className="mkt-plan-prices mkt-plan-prices-rate" index={3}>
      <div>
        <p className="mkt-muted">Standard modules / month</p>
        <p className="mkt-price">{monthly.totalLabel} <span>/ month</span></p>
        <p className="mkt-muted">{monthly.breakdown}</p>
      </div>
      <div>
        <p className="mkt-muted">Accounts + POS / month</p>
        <p className="mkt-price">{posMonthly.totalLabel} <span>/ month</span></p>
        <p className="mkt-muted">{posMonthly.breakdown}</p>
      </div>
    </Reveal>
    <div className="mkt-module-price-grid">
      {MODULE_PRODUCT_LIST.map((product, index) => {
        const productMonthly = priceForProduct(product, "monthly");
        const productAnnual = priceForProduct(product, "annual");
        return (
        <Reveal as="article" key={product.key} className="mkt-card mkt-module-price-card" index={index % 4}>
          <h2>{product.name}</h2>
          <p>{product.description}</p>
          <ul className="mkt-ticks">{product.includes.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="mkt-module-price-line"><strong>{productMonthly.totalLabel}</strong> <span>/ month</span></p>
          <p className="mkt-muted">or {productAnnual.totalLabel} / year · GST included in totals</p>
        </Reveal>
        );
      })}
    </div>
    <Reveal className="mkt-cta-row" index={4}>
      <ProductCta primary />
      <Link className="mkt-btn" to={marketingPaths.contact}>Request a demo</Link>
    </Reveal>
    <Reveal as="p" className="mkt-note" index={5}>
      A new workspace includes 14 days with every module open. Signing up does not charge a card.
      After the trial, unlock only what you need. Your records stay.
    </Reveal>
  </section></RevealProvider>;
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
          <p>More than 15 years of experience in the IT industry across the United States, Ireland, and India, including roles as a Database Administrator, Cloud Architect, and DevOps Engineer at Deloitte and Oracle Corporation.</p>
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

export function ResourcesPage() {
  const links = [
    [`${marketingPaths.how}#install`, "Install on iPhone or Android", "Add MyFinTracker to the home screen and open it from its own icon."],
    [marketingPaths.how, "How it works", "The path from sign-in to a record you confirm."],
    [marketingPaths.features, "Feature directory", "Every module currently in the product."],
    [marketingPaths.security, "Security", "Roles, companies, locks, and review."],
    [marketingPaths.pricing, "Pricing", "Modules from ₹498 + GST 18% per month; Accounts + POS ₹598 + GST. 14-day free trial."],
    [marketingPaths.about, "About MyFinTracker", "What MyFinTracker stands for and who uses it."],
    [marketingPaths.founder, "CEO and Founder", "Sudheer Kumar Buyyani, and the experience behind MyFinTracker."],
    [marketingPaths.contact, "Request a demo", "A local note until contact is connected."],
  ];
  return <RevealProvider intent="content">
  <section className="mkt-section">
    <PageTitle title="MyFinTracker resources" />
    <Reveal>
      <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Resources</p>
      <h1>Read the product before you sign in.</h1>
    </Reveal>
    <Reveal className="mkt-grid three">
      {links.map(([to, title, text]) => <Link key={to} to={to} className="mkt-card"><h2>{title}</h2><p>{text}</p></Link>)}
    </Reveal>
  </section>
  <PageClose />
  </RevealProvider>;
}
