import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { FeatureIcon } from "./icons.jsx";
import { featurePath, marketingPaths } from "./paths.js";
import { ProductCta } from "./ProductCta.jsx";
import { ProductPreview } from "./ProductPreview.jsx";

const VALUES = [
  { icon: "Landmark", title: "Accounting", text: "Vouchers, stock, GST preparation, and statements for the company you open." },
  { icon: "HandCoins", title: "Collections", text: "See who is due and record what was received." },
  { icon: "CalendarDays", title: "Finance", text: "Daily collections and monthly repayments on the customer account." },
  { icon: "Gavel", title: "Chit Funds", text: "Schemes, members, auctions, and dividends." },
  { icon: "Receipt", title: "Payments", text: "Receipts, a cash and UPI split, and a WhatsApp draft you send." },
  { icon: "Sparkles", title: "AI insights", text: "Questions, bill drafts, and highlights from your own records." },
];

const PILLARS = [
  {
    id: "accounts",
    title: "Accounting",
    text: "The company book for a shop, a trader, a service business, or a finance company.",
    items: ["Chart of accounts and ledgers", "Sales, purchases, receipts, and payments", "Contra, journal, and credit and debit notes", "Inventory and GST preparation", "Receivables, payables, and bank reconciliation", "Day book, trial balance, profit and loss, balance sheet, and cash flow"],
    to: "accounts-overview",
    link: "Explore Accounting",
  },
  {
    id: "finance",
    title: "Daily and monthly finance",
    text: "Customer finance and the collections that follow it.",
    items: ["Customer accounts", "Daily collections and monthly repayments", "Interest and overdue follow-up", "Statements and payment history", "Collection staff and their assignments"],
    to: "daily-finance",
    link: "Explore Finance",
  },
  {
    id: "chit",
    title: "Chit funds",
    text: "Schemes, members, and the auction you open and close.",
    items: ["Schemes and members", "Installments and payments", "Live bidding and winning bids", "Dividends and statements", "Scheme reports"],
    to: "auction-chit",
    link: "Explore Chit Funds",
  },
];

const AI = [
  { slug: "ask-the-books", title: "Ask the books", text: "Ask about receivables, profit, GST, collections, or why the cashbook differs from Accounts." },
  { slug: "bill-scanning", title: "Bill draft", text: "A supplier photo becomes a draft. You review it, then save." },
  { slug: "bookkeeping-suggestions", title: "Bookkeeping suggestions", text: "Suggests an expense ledger or a bank match you accepted before." },
  { slug: "attention-center", title: "Attention list", text: "Names collections and dues that need a person." },
  { slug: "anomaly-detection", title: "Unusual days", text: "Flags a daily collection day that looks unlike recent receipts." },
];

const AUDIENCES = [
  { title: "Finance businesses", text: "Customers, financing, collections, and agents.", to: "daily-finance" },
  { title: "Chit fund operators", text: "Schemes, auctions, members, and dividends.", to: "auction-chit" },
  { title: "Shops and traders", text: "Sales, purchases, stock, and customer balances.", to: "inventory" },
  { title: "Service businesses", text: "Invoices, expenses, payments, and profit.", to: "vouchers" },
  { title: "Small and medium businesses", text: "Accounting, GST preparation, banking, and payables.", to: "accounts-overview" },
];

const FAQ = [
  ["What is FinTrack?", "One login for accounting, daily and monthly finance, collections, chit funds, payments, and AI suggestions from those records."],
  ["Can I use it only for accounting?", "Yes. Accounts can stand on its own: vouchers, inventory, GST preparation, banking, receivables, payables, and the statements."],
  ["Can a finance business use it?", "Yes. Daily Finance and Monthly Finance keep customer accounts, repayments, and collections."],
  ["Does it support chit funds?", "Yes. Schemes, members, live bidding, payments, dividends, and reports."],
  ["Does it support GST?", "It prepares GST summaries from posted vouchers. Filing stays outside FinTrack."],
  ["Can I send WhatsApp messages?", "FinTrack opens WhatsApp with a reminder, receipt, or statement. You send the message."],
  ["Does it have AI?", "Ask FinTrack answers from this workspace. Bill drafts, bookkeeping suggestions, an attention list, and unusual collection days are there to review. A forecast is only a sketch inside Ask FinTrack."],
];

export function HomePage() {
  const { signedIn = false } = useOutletContext() || {};
  const [openFaq, setOpenFaq] = useState(0);
  useEffect(() => { document.title = "FinTrack — Accounting, finance, collections, and AI"; }, []);

  return <>
    <section className="mkt-hero">
      <div className="mkt-wrap mkt-hero-grid">
        <div className="mkt-hero-copy">
          <p className="mkt-kicker">Accounting, finance, collections, and AI</p>
          <h1>Your business, in one place.</h1>
          <p>From daily collections to the company books. FinTrack is for a finance business, a chit fund, a shop, a service company, or a growing firm that wants the numbers together.</p>
          <div className="mkt-cta-row">
            <ProductCta primary />
            <Link className="mkt-btn" to={marketingPaths.contact}>Request a demo</Link>
            <Link className="mkt-btn ghost" to={marketingPaths.how}>See how it works</Link>
          </div>
        </div>
        <ProductPreview scene="accounts" />
      </div>
    </section>

    <section className="mkt-section">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <h2>One platform. Several kinds of work.</h2>
        </div>
        <div className="mkt-grid six">
          {VALUES.map(item => <article key={item.title} className="mkt-card">
            <div className="mkt-icon"><FeatureIcon name={item.icon} /></div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className="mkt-section mkt-tint">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <h2>The books, the collections, and the chit.</h2>
          <p className="mkt-lead">Accounting in one app, collections in another, and customers in a spreadsheet is the work FinTrack puts in one login.</p>
        </div>
        <div className="mkt-grid three">
          {PILLARS.map(pillar => <article key={pillar.id} id={pillar.id} className="mkt-card">
            <h3>{pillar.title}</h3>
            <p>{pillar.text}</p>
            <ul className="mkt-ticks">{pillar.items.map(item => <li key={item}>{item}</li>)}</ul>
            <Link className="mkt-text-link" to={featurePath(pillar.to)}>{pillar.link}</Link>
          </article>)}
        </div>
      </div>
    </section>

    <section className="mkt-section" id="intelligence">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <h2>AI that reads your records.</h2>
          <p className="mkt-lead">Ask a question, review a bill draft, or look at who still needs a follow-up. You post the voucher, accept the bank match, and send the message.</p>
        </div>
        <div className="mkt-grid three">
          {AI.map(item => <Link key={item.slug} to={featurePath(item.slug)} className="mkt-card mkt-card-link">
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </Link>)}
        </div>
        <p className="mkt-lead">A forward-looking question can sketch an outlook inside Ask FinTrack. That sketch is not posted into the books.</p>
      </div>
    </section>

    <section className="mkt-section mkt-tint">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <h2>Built around the business you run.</h2>
        </div>
        <div className="mkt-grid three">
          {AUDIENCES.map(item => <Link key={item.title} to={featurePath(item.to)} className="mkt-card mkt-card-link">
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </Link>)}
        </div>
      </div>
    </section>

    <section className="mkt-section">
      <div className="mkt-wrap mkt-faq-wrap">
        <div>
          <h2>Questions</h2>
          <p className="mkt-lead">Short answers about what is in the product today.</p>
        </div>
        <div className="mkt-faq">
          {FAQ.map(([question, answer], index) => <div key={question} className="mkt-faq-item">
            <button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>{question}</button>
            {openFaq === index && <p>{answer}</p>}
          </div>)}
        </div>
      </div>
    </section>

    <section className="mkt-band">
      <div className="mkt-wrap">
        <h2>Bring the books and the collections together.</h2>
        <p>Start free opens the existing sign-in. Request a demo if you want a walkthrough first.</p>
        <div className="mkt-cta-row">
          <ProductCta primary />
          <Link className="mkt-btn light" to={marketingPaths.contact}>Request a demo</Link>
          {signedIn ? <Link className="mkt-btn light" to="/dashboard">Open FinTrack</Link> : null}
        </div>
      </div>
    </section>
  </>;
}
