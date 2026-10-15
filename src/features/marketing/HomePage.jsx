import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useOutletContext } from "react-router";
import { FrequentlyAskedQuestions } from "../../components/ui/FrequentlyAskedQuestions.jsx";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { TypewriterText } from "../../components/ui/TypewriterText.jsx";
import "../intelligence/assistant/assistant.css";
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
    items: ["Chart of accounts and ledgers", "Sales, purchases, receipts, and payments", "Contra, journal, and credit and debit notes", "Inventory and GST preparation", "Receivables, payables, and bank reconciliation", "Customer profiles with a FinTrack credit score", "Day book, trial balance, profit and loss, balance sheet, and cash flow", "Monthly income and expense chart and spending analysis", "Expenses by month and category, with every entry", "Move in from Tally, Zoho Books, Book Keeper, or Excel"],
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
  { slug: "ai-bookkeeper", title: "Tell FinTrack", text: "“I bought a laptop for ₹85,000 using HDFC” becomes a balanced draft, explained in plain words. You post it." },
  { slug: "ai-setup", title: "AI setup", text: "Say what kind of business you run and answer a few questions. FinTrack sets up ledgers, banks, GST, and stock categories." },
  { slug: "ai-migration", title: "Move from Tally or Excel", text: "Upload your old books. FinTrack maps the accounts, finds duplicate parties, and asks only about the exceptions." },
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

const FY = "FY 2026–27";

// Answers as Ask FinTrack returned them in the workspace on 2026-10-16.
const ASK_EXAMPLES = [
  {
    icon: "HandCoins",
    question: "Who has not paid today?",
    answer: {
      title: "Not paid today",
      summary: "3 daily customers have not paid on 2026-10-16. Pending ₹1,500 of ₹1,500 expected.",
      lines: [
        { label: "Customer 1", detail: "2 recent misses", amount: "₹41,000" },
        { label: "Customer 2", detail: "2 recent misses", amount: "₹40,500" },
        { label: "Customer 3", detail: "2 recent misses", amount: "₹40,500" },
      ],
      period: "2026-10-16",
      source: "Daily Finance · Today’s collection",
    },
  },
  {
    icon: "LineChart",
    question: "Why did profit decrease?",
    answer: {
      title: "Profit compared with last month",
      summary: "Net profit is ₹-64,500 so far in 2026-10 and was ₹0 in 2026-09. Income is ₹0 higher. Expenses are ₹64,500 higher.",
      lines: [
        { label: "This month", detail: "Net profit", amount: "₹-64,500" },
        { label: "Last month", detail: "Net profit", amount: "₹0" },
        { label: "Income change", amount: "₹0" },
        { label: "Expense change", amount: "₹64,500" },
      ],
      period: "2026-09 to 2026-10",
      source: "Accounts · Profit and loss",
      filters: "Company 1 · 2026-10 · 2026-09",
      warning: "The change is the difference in posted profit and loss. It is not a cause beyond income and expense totals.",
    },
  },
  {
    icon: "PieChart",
    question: "Which expenses increased this month?",
    answer: {
      title: "Expenses that increased",
      summary: "4 expense ledgers are higher than 2026-09. Rent is up ₹25,000.",
      lines: [
        { label: "Rent", detail: "Increase", amount: "₹25,000" },
        { label: "Salary", detail: "Increase", amount: "₹25,000" },
        { label: "Office Expenses", detail: "Increase", amount: "₹12,000" },
        { label: "Electricity", detail: "Increase", amount: "₹2,500" },
      ],
      period: "2026-09 to 2026-10",
      source: "Accounts · Profit and loss",
      filters: "Company 1 · 2026-10 · 2026-09",
    },
  },
  {
    icon: "ArrowDownLeft",
    question: "Show receivables due this week.",
    answer: {
      title: "Receivables due this week",
      summary: "No receivable is due between 2026-10-16 and 2026-10-23.",
      lines: [],
      period: "2026-10-16 to 2026-10-23",
      source: "Accounts · Receivables register",
      filters: "Company 1 · Due 2026-10-16 to 2026-10-23",
    },
  },
  {
    icon: "Wallet",
    question: "What is the cashbook cash balance?",
    answer: {
      title: "Cashbook",
      summary: "Cashbook cash is ₹-27,49,000, bank is ₹24,00,500 and UPI is ₹15,58,000. These are running balances of every recorded cashbook entry. Company 1 cash ledger is ₹8,14,000. That figure is the Accounts book, not the cashbook.",
      lines: [
        { label: "Cash", detail: "Running balance", amount: "₹-27,49,000" },
        { label: "Bank", detail: "Running balance", amount: "₹24,00,500" },
        { label: "UPI", detail: "Running balance", amount: "₹15,58,000" },
        { label: "Total", detail: "Running balance", amount: "₹12,09,500" },
        { label: "Today's in", detail: "2026-10-16", amount: "₹0" },
        { label: "Today's out", detail: "2026-10-16", amount: "₹0" },
        { label: "Company 1 cash ledger", detail: "Accounts, separate from the cashbook", amount: "₹8,14,000" },
      ],
      period: "Running balances",
      source: "Cashbook · Cashbook balances",
      filters: "Finance cashbook",
      warning: "Cash, bank, and UPI here are running cashbook balances. They are not today's movement, and they are not the Accounts cash ledger.",
    },
  },
  {
    icon: "FileBarChart",
    question: "Open the GST report.",
    answer: {
      title: "GST this period",
      summary: "Output GST is ₹0, input GST is ₹0 and net GST is ₹0 for 2026-04-01 to 2026-10-16.",
      lines: [
        { label: "Output GST", amount: "₹0" },
        { label: "Input GST", amount: "₹0" },
        { label: "Net GST", amount: "₹0" },
      ],
      period: "2026-04-01 to 2026-10-16",
      source: "Accounts · GST books · 2026-04-01 to 2026-10-16",
      filters: "Company 1",
    },
  },
];

// Same markup as the workspace Ask FinTrack answer; only the summary types, the rest fades in after it.
function AskAnswer({ id, index, answer, delay, expanded, rowHeight, controls, onToggle, onMeasure }) {
  const boxRef = useRef(null);
  const bodyRef = useRef(null);
  const [typed, setTyped] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const onDone = useCallback(() => setTyped(true), []);

  useEffect(() => {
    const box = boxRef.current;
    const body = bodyRef.current;
    if (!box || !body || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const style = getComputedStyle(box);
      const chrome = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, key) => sum + parseFloat(style[key]), 0);
      const full = Math.ceil(body.offsetHeight + chrome);
      setFullHeight(full);
      setOverflows(full > parseFloat(style.getPropertyValue("--ask-collapsed")) + 1);
      onMeasure(index, full);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [index, onMeasure]);

  const openHeight = Math.max(fullHeight, rowHeight);
  return <>
    <article
      ref={boxRef}
      id={id}
      className="ft-ask-answer mkt-ask-answer"
      data-overflow={overflows}
      style={expanded && openHeight ? { height: openHeight, maxHeight: openHeight } : undefined}
    >
      <div ref={bodyRef} className="mkt-ask-body">
        <p className="mkt-ask-kicker">Answer</p>
        <header className="ft-ask-answer-head"><h4>{answer.title}</h4></header>
        <TypewriterText text={answer.summary} delay={delay} onDone={onDone} />
        <div className="mkt-ask-rest" data-shown={typed}>
          {answer.lines.length ? <ul className="ft-ask-lines mkt-ask-lines">
            {answer.lines.map(line => <li key={`${line.label}-${line.detail || ""}`}>
              <span><strong>{line.label}</strong>{line.detail ? <em>{line.detail}</em> : null}</span>
              <span className="mkt-ask-amount">{line.amount}</span>
            </li>)}
          </ul> : null}
          <dl className="ft-ask-meta mkt-ask-meta">
            <div><dt>Period</dt><dd>{answer.period}</dd></div>
            <div><dt>Financial year</dt><dd>{FY}</dd></div>
            <div><dt>Source</dt><dd>{answer.source}</dd></div>
            {answer.filters ? <div><dt>Filters</dt><dd>{answer.filters}</dd></div> : null}
          </dl>
          {answer.warning ? <p className="ft-ask-warning mkt-ask-warning">{answer.warning}</p> : null}
        </div>
      </div>
    </article>
    {overflows ? <button type="button" className="mkt-ask-more" aria-expanded={expanded} aria-controls={controls} onClick={event => onToggle(index, event.currentTarget.closest(".mkt-ask-tile"))}>
      {expanded ? "Show less" : "Show full answer"} <ChevronDown size={16} aria-hidden="true" />
    </button> : <span className="mkt-ask-more" aria-hidden="true" />}
  </>;
}

// Each row expands on its own. Other open rows stay open. Scroll is locked to the clicked tile so the page does not jump.
function AskGrid() {
  const baseId = useId();
  const gridRef = useRef(null);
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const [heights, setHeights] = useState({});
  const [columns, setColumns] = useState(1);
  const onMeasure = useCallback((index, full) => setHeights(prev => (prev[index] === full ? prev : { ...prev, [index]: full })), []);
  const ids = ASK_EXAMPLES.map((_, index) => `${baseId}-answer-${index}`);
  const rowOf = index => Math.floor(index / Math.max(columns, 1));
  const rowHeight = index => {
    const start = index - (index % Math.max(columns, 1));
    let max = 0;
    for (let i = start; i < start + columns; i += 1) max = Math.max(max, heights[i] || 0);
    return max;
  };
  const rowControls = index => {
    const start = index - (index % Math.max(columns, 1));
    return ids.slice(start, start + columns).join(" ");
  };

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;
    const readColumns = () => getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    setColumns(readColumns());
    if (typeof ResizeObserver === "undefined") return undefined;
    let last = readColumns();
    const observer = new ResizeObserver(() => {
      const next = readColumns();
      if (next === last) return;
      last = next;
      setColumns(next);
      setExpandedRows(new Set());
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const onToggle = (index, tile) => {
    const row = rowOf(index);
    const anchorTop = tile?.getBoundingClientRect().top ?? null;
    setExpandedRows(current => {
      const next = new Set(current);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
    if (anchorTop == null || !tile) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const delta = tile.getBoundingClientRect().top - anchorTop;
        if (Math.abs(delta) > 1) window.scrollBy(0, delta);
      });
    });
  };

  return <div ref={gridRef} className="mkt-grid three mkt-ask-grid">
    {ASK_EXAMPLES.map((item, index) => {
      const expanded = expandedRows.has(rowOf(index));
      return <Reveal as="article" key={item.question} className="mkt-ask-tile" data-expanded={expanded} index={index % 3}>
        <div className="mkt-ask-prompt">
          <span className="mkt-ask-prompt-icon" aria-hidden="true"><FeatureIcon name={item.icon} size={18} /></span>
          <div className="mkt-ask-prompt-copy">
            <p className="mkt-ask-kicker">You asked</p>
            <h3>{item.question}</h3>
          </div>
        </div>
        <AskAnswer
          id={ids[index]}
          index={index}
          answer={item.answer}
          delay={(index % 3) * 40}
          expanded={expanded}
          rowHeight={rowHeight(index)}
          controls={rowControls(index)}
          onToggle={onToggle}
          onMeasure={onMeasure}
        />
      </Reveal>;
    })}
  </div>;
}

const AUDIENCES = [
  { title: "Finance businesses", text: "Customers, financing, collections, and agents.", to: "daily-finance" },
  { title: "Chit fund operators", text: "Schemes, auctions, members, and dividends.", to: "auction-chit" },
  { title: "Shops and traders", text: "Sales, purchases, stock, and customer balances.", to: "inventory" },
  { title: "Service businesses", text: "Invoices, expenses, payments, and profit.", to: "vouchers" },
  { title: "Small and medium businesses", text: "Accounting, GST preparation, banking, and payables.", to: "accounts-overview" },
];

const FAQ = [
  { question: "What is FinTrack?", answer: "One login for accounting, daily and monthly finance, collections, chit funds, payments, and AI suggestions from those records." },
  { question: "Can I use it only for accounting?", answer: "Yes. Accounts can stand on its own: vouchers, inventory, GST preparation, banking, receivables, payables, and the statements." },
  { question: "Can a finance business use it?", answer: "Yes. Daily Finance and Monthly Finance keep customer accounts, repayments, and collections." },
  { question: "Does it support chit funds?", answer: "Yes. Schemes, members, live bidding, payments, dividends, and reports." },
  { question: "Does it support GST?", answer: "It prepares GST summaries from posted vouchers. Filing stays outside FinTrack." },
  { question: "Can I send WhatsApp messages?", answer: "FinTrack opens WhatsApp with a reminder, receipt, or statement. You send the message." },
  { question: "Does it have AI?", answer: "Yes, included in the plan. AI Review in Accounts gives a cash-flow forecast, expense and supplier price changes, collection priorities, unusual activity alerts, GST checks, month-end readiness, bank matching suggestions, and stock forecasts. Chit Fund has scheme health. Ask FinTrack answers questions from this workspace, bill photos become drafts, and Tell FinTrack turns a plain sentence into an entry. AI also sets up new books from a few questions and maps data brought in from Tally, Zoho Books, or Excel. Every suggestion shows its reason and waits for you to act." },
  { question: "What is Ask FinTrack?", answer: "A question box on every screen. Ask “Who has not paid today?”, “Why did profit decrease?”, or “Which expenses increased this month?” and the answer comes from this workspace’s records, with the period and the report it used. It is read-only and does not guess figures it cannot find." },
  { question: "Does the AI change my books?", answer: "No. It does not post vouchers, file GST, lock a period, reverse an entry, create a purchase order, or send a message. A bank match is posted only when you approve it, a Tell FinTrack draft only when you choose Post, and imported data only when you choose Import. A locked period cannot be changed from a suggestion." },
  { question: "Can I move my books from Tally or Excel?", answer: "Yes. Upload a Tally XML export, or Excel and CSV files from Zoho Books, Book Keeper, or your own sheets. FinTrack shows how many customers, suppliers, ledgers, and transactions it found, how many accounts it mapped automatically, and the exceptions for you to review before anything is imported." },
  { question: "What reports are included?", answer: "Daily and Monthly Finance have a collection report for any date and a Daily or Monthly P&L for the lending book. Chit Fund has a month statement PDF, a commission Profit & Loss by scheme, and scheme health. Accounts has the Day Book, Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, GST, receivables, payables, and stock reports, with CSV, Excel, and PDF export." },
  { question: "Can I install it on my phone?", answer: "Yes. FinTrack is the mobile app: add it to the home screen from Safari on iPhone or iPad, or from Chrome on Android. It opens from its own icon. Sign in the same way you do in the browser." },
  { question: "How is this different from Tally?", answer: "TallyPrime does not have a mobile app for recording the books. On a phone it is for viewing reports. FinTrack installs on the phone, and collections, vouchers, and chit work are done there." },
];

export function HomePage() {
  const { signedIn = false } = useOutletContext() || {};
  useEffect(() => { document.title = "FinTrack — Accounting and collections on your phone"; }, []);

  return <RevealProvider intent="landing">
    <section className="mkt-hero">
      <div className="mkt-wrap mkt-hero-grid">
        <div className="mkt-hero-copy">
          <Reveal as="p" className="mkt-kicker">A mobile app for the books</Reveal>
          <Reveal as="h1" index={1}>Your business, on the phone.</Reveal>
          <Reveal as="p" index={2}>FinTrack installs on iPhone and Android and opens from its own icon. Collections, company accounts, and chit funds are in that app. TallyPrime does not have a mobile app for recording the books. On a phone it is for viewing reports.</Reveal>
          <Reveal className="mkt-cta-row" index={3}>
            <ProductCta primary />
            <Link className="mkt-btn" to={`${marketingPaths.how}#install`}>Install on iPhone or Android</Link>
            <Link className="mkt-btn ghost" to={marketingPaths.contact}>Request a demo</Link>
          </Reveal>
        </div>
        <Reveal index={2} duration={1.1} style={{ minWidth: 0 }}><ProductPreview scene="accounts-overview" /></Reveal>
      </div>
    </section>

    <section className="mkt-section">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <Reveal as="h2">One platform. Several kinds of work.</Reveal>
        </div>
        <div className="mkt-grid six">
          {VALUES.map((item, index) => <Reveal as="article" key={item.title} className="mkt-card" index={index % 3}>
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
          <Reveal as="h2">The books, the collections, and the chit.</Reveal>
          <Reveal as="p" className="mkt-lead" index={1}>Accounting in one app, collections in another, and customers in a spreadsheet is the work FinTrack puts in one login.</Reveal>
        </div>
        <div className="mkt-grid three">
          {PILLARS.map((pillar, index) => <Reveal as="article" key={pillar.id} id={pillar.id} className="mkt-card" index={index % 3}>
            <h3>{pillar.title}</h3>
            <p>{pillar.text}</p>
            <ul className="mkt-ticks">{pillar.items.map(item => <li key={item}>{item}</li>)}</ul>
            <Link className="mkt-text-link" to={featurePath(pillar.to)}>{pillar.link}</Link>
          </Reveal>)}
        </div>
      </div>
    </section>

    <section className="mkt-section mkt-tint" id="ask-fintrack">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <Reveal as="p" className="mkt-kicker"><FeatureIcon name="MessageCircle" size={16} /> Ask FinTrack</Reveal>
          <Reveal as="h2" index={1}>Ask your books the way you ask your accountant.</Reveal>
          <Reveal as="p" className="mkt-lead" index={2}>Type a question in plain English and FinTrack answers from your own records: the figures, the customers or ledgers behind them, the period, and the report they came from. One tap opens that screen.</Reveal>
        </div>
        <AskGrid />
        <Reveal as="p" className="mkt-lead">Read-only. Asking never posts, sends, or changes anything, and a collection agent sees only their own customers. <Link className="mkt-text-link" to={featurePath("ask-fintrack")}>See everything you can ask</Link></Reveal>
      </div>
    </section>

    <section className="mkt-section" id="intelligence">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <Reveal as="h2">AI that reviews the books with you.</Reveal>
          <Reveal as="p" className="mkt-lead" index={1}>FinTrack reads your own records and points out what needs a look: cash that may run short, costs that rose, GST details to fix, bank lines to match, and stock to reorder. Every suggestion shows its reason, its confidence, and a link to the record. You post the voucher, approve the match, and send the message.</Reveal>
        </div>
        <div className="mkt-grid three">
          {AI.map((item, index) => <Reveal as={Link} key={item.slug} to={featurePath(item.slug)} className="mkt-card mkt-card-link" index={index % 3}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </Reveal>)}
        </div>
        <Reveal as="p" className="mkt-lead">AI Review is a tab in Accounts, included in the plan. A forecast is shown apart from actual figures and is never posted into the books. Nothing is filed, locked, reversed, or sent by itself. <Link className="mkt-text-link" to={featurePath("ai-review")}>Read about AI Review</Link></Reveal>
      </div>
    </section>

    <section className="mkt-section mkt-tint">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <Reveal as="h2">Built around the business you run.</Reveal>
        </div>
        <div className="mkt-grid three">
          {AUDIENCES.map((item, index) => <Reveal as={Link} key={item.title} to={featurePath(item.to)} className="mkt-card mkt-card-link" index={index % 3}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </Reveal>)}
        </div>
      </div>
    </section>

    <section className="mkt-section">
      <div className="mkt-wrap">
        <Reveal as="h2">The mobile app Tally does not have.</Reveal>
        <Reveal as="p" className="mkt-lead" index={1}>Add FinTrack from the browser and record the day’s work on the phone. The owner signs in with email. A collection agent, a customer, or a chit member uses a portal ID and PIN.</Reveal>
        <Reveal className="mkt-cta-row" index={2}>
          <Link className="mkt-btn" to={`${marketingPaths.how}#install`}>Install on iPhone or Android</Link>
        </Reveal>
      </div>
    </section>

    <FrequentlyAskedQuestions
      className="mkt-tint"
      description="Short answers about what is in the product today. If you don't find what you need,"
      contact={<Link to={marketingPaths.contact}>contact us</Link>}
      data={FAQ}
    />

    <section className="mkt-band">
      <div className="mkt-wrap">
        <Reveal as="h2">Bring the books and the collections together.</Reveal>
        <Reveal as="p" index={1}>Start free opens signup for a 14-day trial. No payment is required to start. Request a demo if you want a walkthrough first.</Reveal>
        <Reveal className="mkt-cta-row" index={2}>
          <ProductCta primary />
          <Link className="mkt-btn light" to={marketingPaths.contact}>Request a demo</Link>
          {signedIn ? <Link className="mkt-btn light" to="/dashboard">Open FinTrack</Link> : null}
        </Reveal>
      </div>
    </section>
  </RevealProvider>;
}
