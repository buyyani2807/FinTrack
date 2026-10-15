import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { SECURITY_POINTS, SOLUTIONS, featureBySlug } from "./catalog.js";
import { featurePath, marketingPaths } from "./paths.js";
import { InstallGuide } from "./InstallGuide.jsx";
import { ProductCta } from "./ProductCta.jsx";
import { ProductPreview } from "./ProductPreview.jsx";

function PageTitle({ title }) {
  useEffect(() => { document.title = title; }, [title]);
  return null;
}

export function SolutionsPage() {
  return <RevealProvider intent="content">
  <section className="mkt-section">
    <PageTitle title="FinTrack solutions" />
    <Reveal>
      <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Solutions</p>
      <h1>One platform, for the work you already do.</h1>
      <p className="mkt-lead">Finance businesses, chit operators, shops, traders, service companies, and small and medium businesses. Each link opens a module that is in FinTrack today.</p>
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
  { title: "Open one workspace", text: "Financier sign in opens the owner workspace, or create the business account when signup is open. A collection agent, a customer, and a chit member each sign in on the same screen with their own ID and PIN." },
  { title: "Record the work", text: "Add daily or monthly customers, enroll a chit scheme, or post a voucher on the company you have open." },
  { title: "Review what FinTrack highlights", text: "Insights, unusual days, bill drafts, and bank suggestions are there to read. You record the payment, accept the match, or save the voucher." },
  { title: "Share only when you mean to", text: "Download a receipt or statement, or open WhatsApp with a draft. The message is sent when you send it. Portals show a customer or member their own records." },
];

export function HowItWorksPage() {
  return <RevealProvider intent="content">
    <section className="mkt-section">
      <PageTitle title="How FinTrack works" />
      <Reveal>
        <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>How it works</p>
        <h1>You stay in control of every record.</h1>
        <p className="mkt-lead">FinTrack organises the workspace and suggests a next look. Posting, bidding results, and messages wait for a person.</p>
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

export function SecurityPage() {
  return <RevealProvider intent="content">
  <section className="mkt-section">
    <PageTitle title="FinTrack security" />
    <Reveal>
      <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Security</p>
      <h1>Access, isolation, and review.</h1>
      <p className="mkt-lead">This page describes controls that exist in the product. It is not a certification, a government approval, or a promise that data can never be mishandled.</p>
    </Reveal>
    <Reveal className="mkt-grid two">
      {SECURITY_POINTS.map(point => <article key={point.title} className="mkt-card">
        <h2>{point.title}</h2>
        <p>{point.text}</p>
      </article>)}
    </Reveal>
  </section>
  <PageClose />
  </RevealProvider>;
}

const PLAN_INCLUDES = [
  "Accounts, cashbook, and GST preparation",
  "Daily and monthly finance",
  "Chit schemes and live bidding",
  "Collection agents, customer portals, and member portals",
  "Collection reports, Daily and Monthly P&L, chit statements, and company reports",
  "AI Review: cash-flow forecast, expense, GST, and month-end checks, bank matching, and stock forecasts",
  "Receipts, and Ask FinTrack when you confirm",
];

export function PricingPage() {
  return <RevealProvider intent="landing"><section className="mkt-section">
    <PageTitle title="FinTrack pricing" />
    <Reveal as="p" className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Pricing</Reveal>
    <Reveal as="h1" index={1}>One plan for all modules.</Reveal>
    <Reveal as="p" className="mkt-lead" index={2}>₹499 a month, or ₹5,000 a year, is the whole workspace. Accounts, finance, chit funds, collections, portals, and AI are included. There is no second plan and no module add-on.</Reveal>
    <Reveal as="article" className="mkt-plan" index={3}>
      <h2>FinTrack</h2>
      <p className="mkt-muted">All modules included</p>
      <div className="mkt-plan-prices">
        <p className="mkt-price">₹499 <span>/ month</span></p>
        <div>
          <p className="mkt-price">₹5,000 <span>/ year</span></p>
          <p className="mkt-muted">₹988 less than twelve monthly payments.</p>
        </div>
      </div>
      <ul className="mkt-ticks">{PLAN_INCLUDES.map((item, index) => <Reveal as="li" key={item} index={index} y={8}>{item}</Reveal>)}</ul>
      <div className="mkt-cta-row"><ProductCta primary /><Link className="mkt-btn" to={marketingPaths.contact}>Request a demo</Link></div>
      <p className="mkt-note">A new workspace includes 14 days. This page states the price. Signing up does not charge a card. After the trial, recording waits until a plan is active. Your records stay.</p>
    </Reveal>
  </section></RevealProvider>;
}

export function PageClose() {
  return <section className="mkt-band">
    <Reveal className="mkt-wrap">
      <h2>Start with the full workspace.</h2>
      <p>One plan includes every module. Start free opens a 14-day trial and does not charge a card.</p>
      <div className="mkt-cta-row"><ProductCta primary /><Link className="mkt-btn light" to={marketingPaths.contact}>Talk to us</Link></div>
    </Reveal>
  </section>;
}

export function AboutPage() {
  return <RevealProvider intent="content">
  <section className="mkt-section">
    <PageTitle title="About FinTrack" />
    <Reveal>
      <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>About</p>
      <h1>Accounting, collections, and chit funds in one workspace.</h1>
      <p className="mkt-lead">FinTrack is for finance businesses that collect daily or monthly, for chit fund operators, and for small and medium businesses that keep company books. Shops and service firms use the same login.</p>
    </Reveal>
    <Reveal className="mkt-role-views">
      <div>
        <h2>Financier</h2>
        <p className="mkt-lead">Financier sign in opens the owner workspace: the dashboard, company books, schemes, staff, and settings.</p>
        <ProductPreview scene="dashboard" />
      </div>
      <div>
        <h2>Collection agent</h2>
        <p className="mkt-lead">Agent login uses an agent ID and PIN and opens the accounts and routes you assign. The owner books, chit book, and company accounts stay closed.</p>
        <ProductPreview scene="finance" />
      </div>
    </Reveal>
    <Reveal as="p" className="mkt-lead">A finance customer or chit member uses a portal ID and PIN and sees only their own account or ticket. Each sign-in is separate, so sharing access with a collector does not open the owner workspace. <Link className="mkt-text-link" to={marketingPaths.security}>Read the access controls</Link>.</Reveal>
    <Reveal className="mkt-split" style={{ marginTop: 36 }}>
      <div>
        <h2>Ask FinTrack shows a suggestion. You confirm it.</h2>
        <p className="mkt-lead">Ask “Who is unpaid today?” and the answer comes from this workspace. You still record the payment. A bill photo stays a draft until you save it. A bank line stays a suggestion until you approve the match. AI Review explains each suggestion and links to the record, and a cash-flow forecast is shown apart from actual figures. Nothing is posted into the books until you act.</p>
        <Link className="mkt-text-link" to={featurePath("ask-fintrack")}>Read about Ask FinTrack</Link>
      </div>
      <ProductPreview scene="intelligence" />
    </Reveal>
  </section>
  <PageClose />
  </RevealProvider>;
}

export function FounderPage() {
  return <RevealProvider intent="content">
  <section className="mkt-section">
    <PageTitle title="Sudheer Kumar Buyyani, CEO and Founder — FinTrack" />
    <Reveal>
      <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>CEO and Founder</p>
      <h1>Sudheer Kumar Buyyani</h1>
      <p className="mkt-lead">Sudheer founded FinTrack so a business can keep accounting, collections, customers, and chit funds in one workspace.</p>
    </Reveal>
    <Reveal as="article" className="mkt-profile">
      <div className="mkt-profile-photo">
        <img src="/founder/sudheer-kumar-buyyani.jpg" alt="Sudheer Kumar Buyyani, CEO and Founder of FinTrack" width="888" height="1024" />
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
    <PageTitle title="Contact FinTrack" />
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
        <p>Login opens the existing FinTrack authentication screen, including financier, collection agent, customer, and chit member.</p>
        <div className="mkt-cta-row"><Link className="mkt-btn primary" to={marketingPaths.login}>Login</Link></div>
      </article>
    </Reveal>
  </section></RevealProvider>;
}

export function ResourcesPage() {
  const links = [
    [`${marketingPaths.how}#install`, "Install on iPhone or Android", "Add FinTrack to the home screen and open it from its own icon."],
    [marketingPaths.how, "How it works", "The path from sign-in to a record you confirm."],
    [marketingPaths.features, "Feature directory", "Every module currently in the product."],
    [marketingPaths.security, "Security", "Roles, companies, locks, and review."],
    [marketingPaths.pricing, "Pricing", "One plan for all modules: ₹499 a month, or ₹5,000 a year."],
    [marketingPaths.about, "About FinTrack", "Who the workspace is for."],
    [marketingPaths.founder, "CEO and Founder", "Sudheer Kumar Buyyani, and the experience behind FinTrack."],
    [marketingPaths.contact, "Request a demo", "A local note until contact is connected."],
  ];
  return <RevealProvider intent="content">
  <section className="mkt-section">
    <PageTitle title="FinTrack resources" />
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
