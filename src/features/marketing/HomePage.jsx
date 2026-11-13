import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Check, Gavel, MessageCircle, Sparkles, TrendingUp, WifiOff } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/Accordion.jsx";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { TypewriterText } from "../../components/ui/TypewriterText.jsx";
import "../intelligence/assistant/assistant.css";
import { FeatureIcon } from "./icons.jsx";
import { PRODUCT_NAME } from "../../lib/brand.js";
import { priceForPeriod } from "../commercial/moduleProducts.js";
import { FAQ } from "./faq.js";
import { HomeModules } from "./HomeModules.jsx";
import { featurePath, marketingPaths } from "./paths.js";
import { ProductCta } from "./ProductCta.jsx";
import { ProductPreview } from "./ProductPreview.jsx";
import { ModuleClosing } from "./ModuleKit.jsx";

const FY = "FY 2026–27";

// Answers as Ask Finny returned them in the workspace on 2026-10-16.
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

// Same markup as the workspace Ask Finny answer; only the summary types, the rest fades in after it.
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

const MONTHLY = priceForPeriod("monthly");

const PROOF = [
  { icon: BadgeCheck, title: "Credit score", text: "from recorded payments" },
  { icon: WifiOff, title: "Offline billing", text: "48 hours, then sync" },
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
  const [topic, setTopic] = useState("all");
  const [thread, setThread] = useState(() => [FAQ[0]]);
  const [typing, setTyping] = useState(null);
  const bodyRef = useRef(null);
  const chatRef = useRef(null);
  const timerRef = useRef(0);
  const items = FAQ.filter(item => topic === "all" || item.topic === topic);
  const asked = new Set(thread.map(item => item.question));

  useEffect(() => () => clearTimeout(timerRef.current), []);
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTo({ top: body.scrollHeight, behavior: "smooth" });
  }, [thread, typing]);

  const ask = item => {
    if (typing) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setTyping(item);
    // On phones the chat sits below the questions, so bring it into view.
    if (window.matchMedia?.("(max-width: 980px)").matches) chatRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    timerRef.current = setTimeout(() => {
      setThread(current => [...current.filter(entry => entry.question !== item.question), item].slice(-3));
      setTyping(null);
    }, reduced ? 0 : 700);
  };

  return <section className="hm-faq" id="faq">
    <div className="mkt-wrap hm-faq-grid">
      <div className="hm-faq-side">
        <Reveal as="p" className="hm-eyebrow">FAQ</Reveal>
        <Reveal as="h2" index={1}>Questions, answered.</Reveal>
        <Reveal as="p" className="hm-faq-lead" index={2}>Tap a question. The answer describes what is in the product today.</Reveal>
        <div className="hm-faq-topics" role="group" aria-label="Question topics">
          {FAQ_TOPICS.map(item => <button key={item.id} type="button" aria-pressed={topic === item.id} onClick={() => setTopic(item.id)}>{item.label}</button>)}
        </div>
        <ul className="hm-faq-chips">
          {items.map(item => <li key={item.question}>
            <button type="button" data-asked={asked.has(item.question)} disabled={Boolean(typing)} onClick={() => ask(item)}>
              {asked.has(item.question) ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}{item.question}
            </button>
          </li>)}
        </ul>
        {/* Phones: the same questions as a tap-to-open list. The chat layout stays for wider screens. */}
        <div className="hm-faq-mobile">
          <Accordion collapsible key={topic}>
            {items.map(item => <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>)}
          </Accordion>
          <p className="hm-faq-mobile-contact">Still have a question? <Link to={marketingPaths.contact}>Contact us</Link></p>
        </div>
      </div>
      <div ref={chatRef} className="hm-chat">
        <header className="hm-chat-head">
          <span className="hm-chat-avatar" aria-hidden="true"><MessageCircle size={20} /></span>
          <span><strong>{PRODUCT_NAME}</strong><small>Answers about the product</small></span>
        </header>
        <div ref={bodyRef} className="hm-chat-body" aria-live="polite">
          {thread.map(item => <div key={item.question} className="hm-chat-pair">
            <p className="hm-bubble is-you">{item.question}</p>
            <p className="hm-bubble is-bot">{item.answer}</p>
          </div>)}
          {typing ? <div className="hm-chat-pair">
            <p className="hm-bubble is-you">{typing.question}</p>
            <p className="hm-bubble is-bot is-typing" aria-label={`${PRODUCT_NAME} is typing`}><i /><i /><i /></p>
          </div> : null}
        </div>
        <footer className="hm-chat-foot">
          <span>Still have a question?</span>
          <Link className="mkt-btn primary" to={marketingPaths.contact}>Contact us</Link>
        </footer>
      </div>
    </div>
  </section>;
}

export function HomePage() {
  useEffect(() => { document.title = `${PRODUCT_NAME} — Accounting and collections on your phone`; }, []);

  return <RevealProvider intent="landing"><div className="hm-home">
    <section className="hm-hero hm-flip">
      <div className="mkt-wrap hm-hero-grid">
        <div className="hm-hero-copy">
          <Reveal as={Link} to={featurePath("offline-billing")} className="hm-pill">
            <span className="hm-pill-tag">New</span> Bill for 48 hours without internet <ArrowRight size={14} aria-hidden="true" />
          </Reveal>
          <Reveal as="h1" index={1}>Collections, chits, and company books.</Reveal>
          <Reveal as="p" className="hm-hero-lead" index={2}>{PRODUCT_NAME} runs daily and monthly finance, chit funds, the cashbook, and GST-ready accounts together, on the web and on your phone. Counter keeps cash and UPI billing going for 48 hours offline, then syncs the sales.</Reveal>
          <Reveal className="hm-cta-row" index={3}>
            <ProductCta primary label="Start free trial" />
            <Link className="mkt-btn ghost" to={marketingPaths.contact}>Book a demo</Link>
          </Reveal>
          <Reveal as="p" className="hm-hero-note" index={4}>{["14 days free", "No payment to start", `Modules from ${MONTHLY.baseLabel} per month`].map(item => <span key={item}><Check size={14} aria-hidden="true" />{item}</span>)}</Reveal>
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

    <section className="home-mod hm-ask hm-flip" id="ask-finny">
      <div className="mkt-wrap">
        <div className="mkt-section-head">
          <Reveal as="p" className="mkt-kicker"><FeatureIcon name="MessageCircle" size={16} /> Ask Finny</Reveal>
          <Reveal as="h2" index={1}>Ask your books the way you ask your accountant.</Reveal>
          <Reveal as="p" className="mkt-lead" index={2}>Type a question in plain English and MyFinTracker answers from your own records: the figures, the customers or ledgers behind them, the period, and the report they came from. One tap opens that screen.</Reveal>
        </div>
        <AskGrid />
        <Reveal as="p" className="mkt-lead">Read-only. Asking never posts, sends, or changes anything, and a collection agent sees only their own customers. <Link className="mkt-text-link" to={featurePath("ask-finny")}>See everything you can ask</Link></Reveal>
      </div>
    </section>

    <HomeFaq />

    <div className="fx hm-trial">
      <ModuleClosing
        title="Start your 14-day free trial today."
        lead={`Every module included. No payment to start. Then modules start from ${MONTHLY.baseLabel} per month.`}
        points={["14 days free", "No payment to start", `Modules from ${MONTHLY.baseLabel} per month`]}
      />
    </div>
  </div></RevealProvider>;
}
