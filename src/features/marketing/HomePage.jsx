import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Check, Gavel, MessageCircle, Smartphone, Sparkles, TrendingUp } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { TypewriterText } from "../../components/ui/TypewriterText.jsx";
import "../intelligence/assistant/assistant.css";
import { FeatureIcon } from "./icons.jsx";
import { HomeModules } from "./HomeModules.jsx";
import { featurePath, marketingPaths } from "./paths.js";
import { ProductCta } from "./ProductCta.jsx";
import { ProductPreview } from "./ProductPreview.jsx";

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

// Each row expands on its own. Other open rows stay open. After layout, the clicked tile is pinned so the question stays in view.
function AskGrid() {
  const baseId = useId();
  const gridRef = useRef(null);
  const anchorRef = useRef(null);
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

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor?.tile?.isConnected) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : 420;
    const started = performance.now();
    let frame = 0;
    const pin = () => {
      if (!anchor.tile.isConnected) return;
      const delta = anchor.tile.getBoundingClientRect().top - anchor.top;
      if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
      const headerBottom = document.querySelector(".mkt-nav-bar")?.getBoundingClientRect().bottom ?? 0;
      const top = anchor.tile.getBoundingClientRect().top;
      if (top < headerBottom + 12) window.scrollBy(0, top - headerBottom - 12);
      if (performance.now() - started < duration) frame = requestAnimationFrame(pin);
      else anchorRef.current = null;
    };
    pin();
    return () => cancelAnimationFrame(frame);
  }, [expandedRows]);

  const onToggle = (index, tile) => {
    const row = rowOf(index);
    if (tile) anchorRef.current = { tile, top: tile.getBoundingClientRect().top };
    setExpandedRows(current => {
      const next = new Set(current);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
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

const FAQ = [
  { topic: "start", question: "What is FinTrack?", answer: "One login for accounting, daily and monthly finance, collections, chit funds, payments, and AI suggestions from those records." },
  { topic: "accounts", question: "Can I use it only for accounting?", answer: "Yes. Accounts can stand on its own: Counter POS billing, vouchers, inventory, payroll, GST preparation, banking, receivables, payables, and the statements, including a page to hand the month to your accountant." },
  { topic: "accounts", question: "Does it have a POS / billing counter?", answer: "Yes. Counter inside Accounts is the till for walk-in and khata sales. Charge posts the sale into the company books and stock. You can print a thermal receipt or share a WhatsApp receipt when you choose. Cashiers can open Counter without the rest of Accounts." },
  { topic: "finance", question: "Can a finance business use it?", answer: "Yes. Daily Finance and Monthly Finance keep customer accounts, repayments, and collections." },
  { topic: "finance", question: "Does it support chit funds?", answer: "Yes. Schemes, members, live bidding, payments, dividends, and reports." },
  { topic: "accounts", question: "Does it support GST?", answer: "It prepares GST summaries from posted vouchers. Filing stays outside FinTrack." },
  { topic: "finance", question: "Can I send WhatsApp messages?", answer: "FinTrack opens WhatsApp with a reminder, receipt, or statement. You send the message." },
  { topic: "ai", question: "Does it have AI?", answer: "Yes, included in the plan. AI Review in Accounts gives a cash-flow forecast, expense and supplier price changes, collection priorities, unusual activity alerts, GST checks, month-end readiness, bank matching suggestions, and stock forecasts. Chit Fund has scheme health. Ask FinTrack answers questions from this workspace, and Tell FinTrack turns a plain sentence into an entry. AI also sets up new books from a few questions and maps data brought in from Tally, Zoho Books, or Excel. Every suggestion shows its reason and waits for you to act." },
  { topic: "ai", question: "What is Ask FinTrack?", answer: "A question box on every screen. Ask “Who has not paid today?”, “Why did profit decrease?”, or “Which expenses increased this month?” and the answer comes from this workspace’s records, with the period and the report it used. It is read-only and does not guess figures it cannot find." },
  { topic: "ai", question: "Does the AI change my books?", answer: "No. It does not post vouchers, file GST, lock a period, reverse an entry, create a purchase order, or send a message. A bank match is posted only when you approve it, a Tell FinTrack draft only when you choose Post, and imported data only when you choose Import. A locked period cannot be changed from a suggestion." },
  { topic: "start", question: "Can I move my books from Tally or Excel?", answer: "Yes. Upload a Tally XML export, or Excel and CSV files from Zoho Books, Book Keeper, or your own sheets. FinTrack shows how many customers, suppliers, ledgers, and transactions it found, how many accounts it mapped automatically, and the exceptions for you to review before anything is imported." },
  { topic: "accounts", question: "What reports are included?", answer: "Daily and Monthly Finance have a collection report for any date and a Daily or Monthly P&L for the lending book. Chit Fund has a month statement PDF, a commission Profit & Loss by scheme, and scheme health. Accounts has the Day Book, Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, GST, item profit, receivables, payables, and stock reports, with CSV, Excel, and PDF export. For the CA gathers the month’s books, GST invoices to check, unmatched bank lines, and stock rows that need review." },
  { topic: "start", question: "Can I install it on my phone?", answer: "Yes. FinTrack is the mobile app: add it to the home screen from Safari on iPhone or iPad, or from Chrome on Android. It opens from its own icon. Sign in the same way you do in the browser." },
  { topic: "start", question: "How is this different from Tally?", answer: "FinTrack keeps accounting, daily and monthly collections, and chit funds in one login, and it installs on the phone. You record the day’s work there." },
];

const PROOF = [
  { icon: BadgeCheck, title: "5 modules", text: "in one login" },
  { icon: Smartphone, title: "iPhone and Android", text: "installs from the browser" },
  { icon: TrendingUp, title: "GST-ready books", text: "with a pack for your CA" },
  { icon: Sparkles, title: "AI that waits", text: "for you to confirm" },
];

function HeroVisual() {
  return <div className="hm-hero-visual">
    <div className="hm-stage">
      <ProductPreview scene="dashboard" />
    </div>
    <div className="hm-float hm-float-a" aria-hidden="true">
      <span className="hm-float-icon"><TrendingUp size={16} /></span>
      <span><small>Collected today</small><strong>₹42,600</strong></span>
      <em>+12%</em>
    </div>
    <div className="hm-float hm-float-b" aria-hidden="true">
      <span className="hm-float-icon is-chit"><Gavel size={16} /></span>
      <span><small>Chit auction</small><strong>Month 6 · Live</strong></span>
    </div>
    <div className="hm-float hm-float-c" aria-hidden="true">
      <span className="hm-float-icon is-ok"><Check size={16} /></span>
      <span><small>GST pack</small><strong>Ready for your CA</strong></span>
    </div>
  </div>;
}

const FAQ_TOPICS = [
  { id: "all", label: "All questions" },
  { id: "start", label: "Getting started" },
  { id: "finance", label: "Finance and chit" },
  { id: "accounts", label: "Accounts and GST" },
  { id: "ai", label: "AI" },
];

function HomeFaq() {
  const baseId = useId();
  const [topic, setTopic] = useState("all");
  const items = FAQ.filter(item => topic === "all" || item.topic === topic);
  const [open, setOpen] = useState(FAQ[0].question);
  const current = items.find(item => item.question === open) || items[0];
  const chooseTopic = id => {
    setTopic(id);
    const first = FAQ.find(item => id === "all" || item.topic === id);
    if (first) setOpen(first.question);
  };
  return <section className="hm-faq" id="faq">
    <div className="mkt-wrap">
      <header className="hm-head">
        <Reveal as="p" className="hm-eyebrow">FAQ</Reveal>
        <Reveal as="h2" index={1}>Questions, answered.</Reveal>
        <Reveal as="p" className="hm-head-lead" index={2}>Short answers about what is in the product today.</Reveal>
      </header>
      <div className="hm-faq-topics" role="group" aria-label="Question topics">
        {FAQ_TOPICS.map(item => <button key={item.id} type="button" aria-pressed={topic === item.id} onClick={() => chooseTopic(item.id)}>{item.label}</button>)}
      </div>
      <div className="hm-faq-body">
        <ol className="hm-faq-list">
          {items.map((item, index) => {
            const selected = item.question === current.question;
            const answerId = `${baseId}-a-${FAQ.indexOf(item)}`;
            return <li key={item.question} data-selected={selected}>
              <button type="button" aria-expanded={selected} aria-controls={answerId} onClick={() => setOpen(item.question)}>
                <span className="hm-faq-num">{String(index + 1).padStart(2, "0")}</span>
                <span className="hm-faq-q">{item.question}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              {selected ? <p id={answerId} className="hm-faq-inline">{item.answer}</p> : null}
            </li>;
          })}
        </ol>
        <aside className="hm-faq-answer" aria-live="polite">
          <div key={current.question} className="hm-faq-answer-inner">
            <span className="hm-faq-answer-icon" aria-hidden="true"><MessageCircle size={22} /></span>
            <h3>{current.question}</h3>
            <p>{current.answer}</p>
          </div>
          <div className="hm-faq-contact">
            <span>Still have a question?</span>
            <Link className="mkt-btn primary" to={marketingPaths.contact}>Contact us</Link>
          </div>
        </aside>
      </div>
    </div>
  </section>;
}

export function HomePage() {
  useEffect(() => { document.title = "FinTrack — Accounting and collections on your phone"; }, []);

  return <RevealProvider intent="landing"><div className="hm-home">
    <section className="hm-hero hm-flip">
      <div className="mkt-wrap hm-hero-grid">
        <div className="hm-hero-copy">
          <Reveal as="a" href="#ask-fintrack" className="hm-pill">
            <span className="hm-pill-tag">New</span> Ask FinTrack answers from your books <ArrowRight size={14} aria-hidden="true" />
          </Reveal>
          <Reveal as="h1" index={1}>Collections, chits, and company books. <span>One login.</span></Reveal>
          <Reveal as="p" className="hm-hero-lead" index={2}>FinTrack runs daily and monthly finance, chit funds, the cashbook, and GST-ready accounts together, on the web and on your phone.</Reveal>
          <Reveal className="hm-cta-row" index={3}>
            <ProductCta primary label="Start free trial" />
            <Link className="mkt-btn ghost" to={marketingPaths.contact}>Book a demo</Link>
          </Reveal>
          <Reveal as="p" className="hm-hero-note" index={4}>{["14 days free", "No payment to start", "₹499 a month after"].map(item => <span key={item}><Check size={14} aria-hidden="true" />{item}</span>)}</Reveal>
        </div>
        <Reveal index={2} duration={1.1} style={{ minWidth: 0 }}><HeroVisual /></Reveal>
      </div>
      <div className="mkt-wrap">
        <ul className="hm-proof">
          {PROOF.map(item => <li key={item.title}><item.icon size={20} aria-hidden="true" /><span><strong>{item.title}</strong> {item.text}</span></li>)}
        </ul>
      </div>
    </section>

    <HomeModules />

    <section className="home-mod hm-ask hm-flip" id="ask-fintrack">
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

    <HomeFaq />

    <section className="hm-cta hm-flip">
      <div className="mkt-wrap">
        <Reveal className="hm-cta-card">
          <div>
            <h2>Start your 14-day free trial today.</h2>
            <p>Every module included. No payment to start. Then ₹499 a month or ₹5,000 a year.</p>
          </div>
          <div className="hm-cta-actions">
            <ProductCta primary label="Start free trial" />
            <Link className="mkt-btn light" to={marketingPaths.contact}>Talk to us</Link>
          </div>
        </Reveal>
      </div>
    </section>
  </div></RevealProvider>;
}
