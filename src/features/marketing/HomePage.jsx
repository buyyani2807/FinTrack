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
  { icon: "Sparkles", title: "AI review", text: "Cash-flow outlook, expense and GST checks, month-end readiness, bank matching, and stock forecasts from your own records." },
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
    items: ["Customer accounts", "Daily collections and monthly repayments", "Interest and overdue follow-up", "Collection report and Daily and Monthly P&L", "Statements and payment history", "Collection staff and their assignments"],
    to: "daily-finance",
    link: "Explore Finance",
  },
  {
    id: "chit",
    title: "Chit funds",
    text: "Schemes, members, and the auction you open and close.",
    items: ["Schemes and members", "Installments and payments", "Live bidding and winning bids", "Dividends and statements", "Month statement PDF and commission Profit & Loss", "Scheme health: collection rate and members falling behind"],
    to: "auction-chit",
    link: "Explore Chit Funds",
  },
];

const AI = [
  { slug: "forecasting", title: "Cash-flow forecast", text: "Where cash may stand today, in 7, 30, and 60 days, with the invoices and bills that drive it." },
  { slug: "expense-insights", title: "Expense and supplier prices", text: "Which costs rose against last month, the 3-month average, and last year, and which supplier raised a price." },
  { slug: "collection-priorities", title: "Who to collect first", text: "Ranked customers with the risk, the reason, and a reminder draft in five languages that you confirm." },
  { slug: "anomaly-detection", title: "Unusual activity", text: "Possible duplicates, bills above a supplier’s average, backdated entries, and odd collection days." },
  { slug: "gst-review", title: "GST review", text: "GSTIN errors, missing HSN codes, and tax that does not match the rate, before you prepare the return." },
  { slug: "month-end-readiness", title: "Month-end readiness", text: "A readiness score and a checklist of what is left before you lock the month." },
  { slug: "bank-matching", title: "Bank matching", text: "Party, invoice, and ledger suggested for each bank line, with a confidence score. You approve." },
  { slug: "stock-forecast", title: "Stock forecast", text: "Which items may run out, when, and how much to consider buying." },
  { slug: "chit-scheme-health", title: "Chit scheme health", text: "Collection rate, overdue members, and members paying later each month." },
  { slug: "ai-review", title: "AI Review", text: "Eight reviews in one Accounts tab, each with its reason, confidence, and a link to the record." },
  { slug: "bill-scanning", title: "Bill draft", text: "A supplier photo becomes a draft. You review it, then save." },
  { slug: "credit-score", title: "Customer credit score", text: "A score from each customer’s own payment history, with the reasons." },
];

const ASK_EXAMPLES = [
  "Who has not paid today?",
  "Why did profit decrease?",
  "Which expenses increased this month?",
  "Show receivables due this week.",
  "What is the cashbook cash balance?",
  "Open the GST report.",
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
  ["Does it have AI?", "Yes, included in the plan. AI Review in Accounts gives a cash-flow forecast, expense and supplier price changes, collection priorities, unusual activity alerts, GST checks, month-end readiness, bank matching suggestions, and stock forecasts. Chit Fund has scheme health. Ask FinTrack answers questions from this workspace, and bill photos become drafts. Every suggestion shows its reason and waits for you to act."],
  ["What is Ask FinTrack?", "A question box on every screen. Ask “Who has not paid today?”, “Why did profit decrease?”, or “Which expenses increased this month?” and the answer comes from this workspace’s records, with the period and the report it used. It is read-only and does not guess figures it cannot find."],
  ["Does the AI change my books?", "No. It does not post vouchers, file GST, lock a period, reverse an entry, create a purchase order, or send a message. A bank match is posted only when you approve it, and a locked period cannot be changed from a suggestion."],
  ["What reports are included?", "Daily and Monthly Finance have a collection report for any date and a Daily or Monthly P&L for the lending book. Chit Fund has a month statement PDF, a commission Profit & Loss by scheme, and scheme health. Accounts has the Day Book, Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, GST, receivables, payables, and stock reports, with CSV, Excel, and PDF export."],
  ["Can I install it on my phone?", "Yes. FinTrack is the mobile app: add it to the home screen from Safari on iPhone or iPad, or from Chrome on Android. It opens from its own icon. Sign in the same way you do in the browser."],
  ["How is this different from Tally?", "TallyPrime does not have a mobile app for recording the books. On a phone it is for viewing reports. FinTrack installs on the phone, and collections, vouchers, and chit work are done there."],
];

export function HomePage() {
  const { signedIn = false } = useOutletContext() || {};
  const [openFaq, setOpenFaq] = useState(0);
  useEffect(() => { document.title = "FinTrack — Accounting and collections on your phone"; }, []);

  return <>
    <section className="mkt-hero">
      <div className="mkt-wrap mkt-hero-grid">
        <div className="mkt-hero-copy">
          <p className="mkt-kicker">A mobile app for the books</p>
          <h1>Your business, on the phone.</h1>
          <p>FinTrack installs on iPhone and Android and opens from its own icon. Collections, company accounts, and chit funds are in that app. TallyPrime does not have a mobile app for recording the books. On a phone it is for viewing reports.</p>
          <div className="mkt-cta-row">
            <ProductCta primary />
            <Link className="mkt-btn" to={`${marketingPaths.how}#install`}>Install on iPhone or Android</Link>
            <Link className="mkt-btn ghost" to={marketingPaths.contact}>Request a demo</Link>
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

    <section className="mkt-section mkt-tint" id="ask-fintrack">
      <div className="mkt-wrap mkt-split">
        <div>
          <p className="mkt-kicker"><FeatureIcon name="MessageCircle" size={16} /> Ask FinTrack</p>
          <h2>Ask your books the way you ask your accountant.</h2>
          <p className="mkt-lead">Type a question in plain English and FinTrack answers from your own records: the figures, the customers or ledgers behind them, the period, and the report they came from. One tap opens that screen.</p>
          <ul className="mkt-ticks">{ASK_EXAMPLES.map(question => <li key={question}>{question}</li>)}</ul>
          <p className="mkt-lead">Read-only. Asking never posts, sends, or changes anything, and a collection agent sees only their own customers.</p>
          <Link className="mkt-text-link" to={featurePath("ask-fintrack")}>See everything you can ask</Link>
        </div>
        <ProductPreview scene="intelligence" />
      </div>
    </section>

    <section className="mkt-section" id="intelligence">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <h2>AI that reviews the books with you.</h2>
          <p className="mkt-lead">FinTrack reads your own records and points out what needs a look: cash that may run short, costs that rose, GST details to fix, bank lines to match, and stock to reorder. Every suggestion shows its reason, its confidence, and a link to the record. You post the voucher, approve the match, and send the message.</p>
        </div>
        <div className="mkt-grid three">
          {AI.map(item => <Link key={item.slug} to={featurePath(item.slug)} className="mkt-card mkt-card-link">
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </Link>)}
        </div>
        <p className="mkt-lead">AI Review is a tab in Accounts, included in the plan. A forecast is shown apart from actual figures and is never posted into the books. Nothing is filed, locked, reversed, or sent by itself. <Link className="mkt-text-link" to={featurePath("ai-review")}>Read about AI Review</Link></p>
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
      <div className="mkt-wrap">
        <h2>The mobile app Tally does not have.</h2>
        <p className="mkt-lead">Add FinTrack from the browser and record the day’s work on the phone. The owner signs in with email. A collection agent, a customer, or a chit member uses a portal ID and PIN.</p>
        <div className="mkt-cta-row">
          <Link className="mkt-btn" to={`${marketingPaths.how}#install`}>Install on iPhone or Android</Link>
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
        <p>Start free opens signup for a 14-day trial. No payment is required to start. Request a demo if you want a walkthrough first.</p>
        <div className="mkt-cta-row">
          <ProductCta primary />
          <Link className="mkt-btn light" to={marketingPaths.contact}>Request a demo</Link>
          {signedIn ? <Link className="mkt-btn light" to="/dashboard">Open FinTrack</Link> : null}
        </div>
      </div>
    </section>
  </>;
}
