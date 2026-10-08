import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FEATURE_PACKS } from "../commercial/featurePacks.js";
import { SECURITY_POINTS, SOLUTIONS, featureBySlug } from "./catalog.js";
import { featurePath, marketingPaths } from "./paths.js";
import { ProductCta } from "./ProductCta.jsx";

function PageTitle({ title }) {
  useEffect(() => { document.title = title; }, [title]);
  return null;
}

export function SolutionsPage() {
  return <section className="mkt-section">
    <PageTitle title="FinTrack solutions" />
    <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Solutions</p>
    <h1>One platform, for the work you already do.</h1>
    <p className="mkt-lead">Finance businesses, chit operators, shops, traders, service companies, and small and medium businesses. Each link opens a module that is in FinTrack today.</p>
    <div className="mkt-grid two">
      {SOLUTIONS.map(item => <article key={item.title} className="mkt-card">
        <h2>{item.title}</h2>
        <p>{item.text}</p>
        <div className="mkt-chip-row">{item.features.map(slug => {
          const feature = featureBySlug(slug);
          return feature ? <Link key={slug} className="mkt-chip" to={featurePath(slug)}>{feature.name}</Link> : null;
        })}</div>
      </article>)}
    </div>
  </section>;
}

const STEPS = [
  { title: "Open one workspace", text: "Sign in as the business owner, or create the business account when signup is open. Collection agents, customers, and chit members use their own login." },
  { title: "Record the work", text: "Add daily or monthly customers, enroll a chit scheme, or post a voucher on the company you have open." },
  { title: "Review what FinTrack highlights", text: "Insights, unusual days, bill drafts, and bank suggestions are there to read. You record the payment, accept the match, or save the voucher." },
  { title: "Share only when you mean to", text: "Download a receipt or statement, or open WhatsApp with a draft. The message is sent when you send it. Portals show a customer or member their own records." },
];

export function HowItWorksPage() {
  return <section className="mkt-section">
    <PageTitle title="How FinTrack works" />
    <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>How it works</p>
    <h1>You stay in control of every record.</h1>
    <p className="mkt-lead">FinTrack organises the workspace and suggests a next look. Posting, bidding results, and messages wait for a person.</p>
    <div className="mkt-grid two mkt-steps">
      {STEPS.map(step => <article key={step.title} className="mkt-card mkt-step">
        <h2>{step.title}</h2>
        <p>{step.text}</p>
      </article>)}
    </div>
    <div className="mkt-cta-row"><ProductCta primary /><Link className="mkt-btn" to={marketingPaths.features}>Explore features</Link></div>
  </section>;
}

export function SecurityPage() {
  return <section className="mkt-section">
    <PageTitle title="FinTrack security" />
    <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Security</p>
    <h1>Access, isolation, and review.</h1>
    <p className="mkt-lead">This page describes controls that exist in the product. It is not a certification, a government approval, or a promise that data can never be mishandled.</p>
    <div className="mkt-grid two">
      {SECURITY_POINTS.map(point => <article key={point.title} className="mkt-card">
        <h2>{point.title}</h2>
        <p>{point.text}</p>
      </article>)}
    </div>
  </section>;
}

const PACK_NOTES = {
  finance: "Daily and monthly finance, dashboard, receipts, and Ask FinTrack.",
  chit: "Chit schemes, dashboard, receipts, and Ask FinTrack.",
  business: "Accounts, cashbook, dashboard, receipts, and Ask FinTrack.",
  full: "Finance, chit, and accounts together. This is the workspace the app opens today.",
};

export function PricingPage() {
  return <section className="mkt-section">
    <PageTitle title="FinTrack pricing" />
    <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Pricing</p>
    <h1>Plans are not billed yet.</h1>
    <p className="mkt-lead">Start free opens the full workspace. A monthly price is not shown here because billing is not connected, and nothing on this page is charged.</p>
    <div className="mkt-grid four">
      {Object.values(FEATURE_PACKS).map(pack => <article key={pack.id} className="mkt-card">
        <h2>{pack.label}</h2>
        <p>{PACK_NOTES[pack.id]}</p>
        <p className="mkt-sample">No price published</p>
      </article>)}
    </div>
    <div className="mkt-cta-row"><Link className="mkt-btn primary" to={marketingPaths.contact}>Request a demo</Link><Link className="mkt-btn" to={marketingPaths.login}>Login</Link></div>
  </section>;
}

export function AboutPage() {
  return <section className="mkt-section">
    <PageTitle title="About FinTrack" />
    <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>About</p>
    <h1>Built so the records sit together.</h1>
    <p className="mkt-lead">Accounting, payments, customers, collections, and the chit book are one login. Ask FinTrack and the other suggestions read those records. You decide what gets posted or sent.</p>
    <div className="mkt-grid three">
      <article className="mkt-card"><h2>For the owner</h2><p>Dashboard, books, schemes, staff, and settings stay in the owner workspace.</p></article>
      <article className="mkt-card"><h2>For the collector</h2><p>A collection agent signs in to assigned accounts and routes, not the full owner books.</p></article>
      <article className="mkt-card"><h2>For the customer</h2><p>A portal ID and PIN open that person’s finance account or chit ticket.</p></article>
    </div>
    <div className="mkt-founder" id="founder">
      <img src="/founder/sudheer-kumar-buyyani.jpg" alt="Sudheer Kumar Buyyani, CEO and Founder of FinTrack" width="888" height="1024" />
      <div>
        <p className="mkt-kicker">Founder</p>
        <h2>Sudheer Kumar Buyyani</h2>
        <p className="mkt-role">CEO and Founder</p>
        <p className="mkt-lead">Sudheer founded FinTrack so a business can keep accounting, collections, customers, and chit funds in one workspace.</p>
        <div className="mkt-grid two">
          <article className="mkt-card">
            <h3>Experience</h3>
            <p>More than 15 years in the IT industry, with work in the United States, Ireland, and India.</p>
          </article>
          <article className="mkt-card">
            <h3>Education</h3>
            <p>Master’s degree in Management Information Systems from UCD Michael Smurfit Graduate Business School, a top business school in Ireland.</p>
          </article>
        </div>
      </div>
    </div>
    <div className="mkt-cta-row"><Link className="mkt-btn" to={marketingPaths.contact}>Talk to us</Link></div>
  </section>;
}

export function ContactPage() {
  const [sent, setSent] = useState(false);
  return <section className="mkt-section">
    <PageTitle title="Contact FinTrack" />
    <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Contact</p>
    <h1>Request a demo.</h1>
    <p className="mkt-lead">Tell us the business and what you want to see. This local preview keeps the note on the page only. It does not email anyone and it does not create an account.</p>
    <div className="mkt-detail">
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
    </div>
  </section>;
}

export function ResourcesPage() {
  const links = [
    [marketingPaths.how, "How it works", "The path from sign-in to a record you confirm."],
    [marketingPaths.features, "Feature directory", "Every module currently in the product."],
    [marketingPaths.security, "Security", "Roles, companies, locks, and review."],
    [marketingPaths.pricing, "Pricing", "Billing is not connected yet."],
    [marketingPaths.about, "About FinTrack", "Who the workspace is for."],
    [marketingPaths.contact, "Request a demo", "A local note until contact is connected."],
  ];
  return <section className="mkt-section">
    <PageTitle title="FinTrack resources" />
    <p className="mkt-kicker" style={{ color: "var(--mkt-accent)" }}>Resources</p>
    <h1>Read the product before you sign in.</h1>
    <div className="mkt-grid three">
      {links.map(([to, title, text]) => <Link key={to} to={to} className="mkt-card"><h2>{title}</h2><p>{text}</p></Link>)}
    </div>
  </section>;
}
