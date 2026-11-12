import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, BookOpenText, CalendarDays, CalendarRange, Check, Coins, FileText, Gavel, Package, Printer, Receipt, Scale, Users, Wallet } from "lucide-react";
import { useInView } from "../../components/ui/useInView.js";
import { featurePath } from "./paths.js";

// Sample figures for the illustrations. They match the demo workspace shown in the product screenshots.
const rupees = value => `₹${Math.round(value).toLocaleString("en-IN")}`;

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

// Starts once the element scrolls into view. Returns [ref, live]; `live` stays false when motion is reduced.
function useLive() {
  const ref = useRef(null);
  const seen = useInView(ref, { rootMargin: "0px 0px -15% 0px" });
  const [reduced] = useState(prefersReducedMotion);
  return [ref, seen && !reduced, reduced];
}

// Steps 0..count-1 every `ms` while live, then holds the last step for `hold` ms and starts over.
function useLoop(live, count, ms, hold = ms * 2) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!live) return undefined;
    const delay = step >= count - 1 ? hold : ms;
    const timer = setTimeout(() => setStep(current => (current >= count - 1 ? 0 : current + 1)), delay);
    return () => clearTimeout(timer);
  }, [live, step, count, ms, hold]);
  return step;
}

// Eases a number from 0 to `to` once `live` turns on.
function useCount(live, to, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!live) return undefined;
    let frame = 0;
    const started = performance.now();
    const tick = now => {
      const t = Math.min((now - started) / duration, 1);
      setValue(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [live, to, duration]);
  return value;
}

function Points({ items }) {
  return <ul className="hm-points">
    {items.map(point => <li key={point}><span aria-hidden="true"><Check size={14} strokeWidth={3} /></span>{point}</li>)}
  </ul>;
}

function Tag({ icon: Icon, children }) {
  return <p className="hm-module-tag"><span className="hm-module-icon" aria-hidden="true"><Icon size={18} /></span>{children}</p>;
}

function Section({ id, flip, children }) {
  return <section id={id} className={`hm-sec${flip ? " hm-flip" : ""}`}>
    <div className="mkt-wrap">{children}</div>
  </section>;
}

function More({ to, children }) {
  return <Link className="hm-module-link" to={to}>{children} <ArrowRight size={16} aria-hidden="true" /></Link>;
}

/* ---------------------------------------------------------------- Daily Finance */
const DAILY_ROWS = [
  { name: "Anjali Reddy", area: "Route 1 · Gandhi Nagar", amount: 180 },
  { name: "Padma Rao", area: "Route 1 · Market Road", amount: 100 },
  { name: "Ravi Kumar", area: "Route 2 · Station Road", amount: 120 },
  { name: "Lakshmi Devi", area: "Route 2 · Temple Street", amount: 240 },
  { name: "Suresh Babu", area: "Route 3 · Bus Stand", amount: 210 },
];
const DAILY_DUE = DAILY_ROWS.reduce((sum, row) => sum + row.amount, 0);

function DailyModule() {
  const [ref, live, reduced] = useLive();
  const step = useLoop(live, DAILY_ROWS.length + 1, 1100, 2600);
  const paid = reduced ? DAILY_ROWS.length : step;
  const collected = DAILY_ROWS.slice(0, paid).reduce((sum, row) => sum + row.amount, 0);
  return <Section id="daily-finance"><article ref={ref} className="hm-module hm-daily" data-mod="daily">
    <div className="hm-module-copy">
      <Tag icon={CalendarDays}>Daily Finance</Tag>
      <h3>Every daily collection on one list.</h3>
      <p className="hm-module-lead">Open a 100-day style account once. Each day MyFinTracker shows who has paid, who is still due, and who to visit first.</p>
      <Points items={["Today’s collection list with what is still due", "Who to collect first, ranked with the reason", "Digital receipts and WhatsApp reminders you send", "Daily collection report and Daily P&L"]} />
      <More to={featurePath("daily-finance")}>Explore Daily Finance</More>
    </div>
    <div className="hm-daily-stage" aria-hidden="true">
      <div className="hm-phone">
        <div className="hm-phone-head">
          <span>Today’s collections</span>
          <strong>{rupees(collected)} <small>of {rupees(DAILY_DUE)}</small></strong>
          <div className="hm-progress"><i style={{ width: `${(collected / DAILY_DUE) * 100}%` }} /></div>
        </div>
        <ul className="hm-phone-list">
          {DAILY_ROWS.map((row, index) => {
            const done = index < paid;
            return <li key={row.name} className={done ? "is-paid" : index === paid ? "is-next" : ""}>
              <span className="hm-avatar">{row.name.split(" ").map(part => part[0]).join("")}</span>
              <span className="hm-phone-name"><strong>{row.name}</strong><small>{row.area}</small></span>
              <span className="hm-phone-amt">{rupees(row.amount)}</span>
              <span className="hm-status">{done ? <><Check size={12} strokeWidth={3} /> Paid</> : index === paid ? "Next" : "Due"}</span>
            </li>;
          })}
        </ul>
      </div>
      <div className="hm-toast" data-show={paid > 0 && paid <= DAILY_ROWS.length}>
        <Receipt size={16} /> Receipt sent on WhatsApp
      </div>
    </div>
  </article></Section>;
}

/* -------------------------------------------------------------- Monthly Finance */
const MONTHLY_OPENING = 150000;
const MONTHLY_ROWS = [
  { month: "May", interest: 2500, principal: 9500, penalty: 0 },
  { month: "Jun", interest: 2310, principal: 9690, penalty: 0 },
  { month: "Jul", interest: 2120, principal: 9880, penalty: 500 },
  { month: "Aug", interest: 1920, principal: 10080, penalty: 0 },
  { month: "Sep", interest: 1720, principal: 10280, penalty: 0 },
  { month: "Oct", interest: 1520, principal: 10480, penalty: 500 },
].reduce((rows, row) => {
  const before = rows.length ? rows[rows.length - 1].balance : MONTHLY_OPENING;
  return [...rows, { ...row, total: row.interest + row.principal + row.penalty, balance: before - row.principal }];
}, []);
const RING = 2 * Math.PI * 92;

function MonthlyModule() {
  const [ref, live, reduced] = useLive();
  const [chosen, setChosen] = useState(null);
  const auto = useLoop(live && chosen === null, MONTHLY_ROWS.length, 1800, 1800);
  const pick = chosen ?? (reduced ? MONTHLY_ROWS.length - 1 : auto);
  const row = MONTHLY_ROWS[pick];
  const repaid = (MONTHLY_OPENING - row.balance) / MONTHLY_OPENING;
  const earned = MONTHLY_ROWS.slice(0, pick + 1).reduce((sum, item) => sum + item.interest + item.penalty, 0);
  const parts = [
    { key: "interest", label: "Interest", value: row.interest },
    { key: "principal", label: "Principal", value: row.principal },
    { key: "penalty", label: "Penalty", value: row.penalty },
  ];
  return <Section id="monthly-finance" flip><article ref={ref} className="hm-module hm-monthly" data-mod="monthly" data-live={live || reduced}>
    <div className="hm-loan">
      <header className="hm-loan-head">
        <div><small>Monthly account</small><strong>Srinivas Motors</strong></div>
        <span>{rupees(MONTHLY_OPENING)} at 2% a month</span>
      </header>
      <div className="hm-loan-body">
        <div className="hm-donut" aria-hidden="true">
          <svg viewBox="0 0 220 220">
            <circle className="hm-donut-track" cx="110" cy="110" r="92" />
            <circle className="hm-donut-arc" cx="110" cy="110" r="92" style={{ strokeDasharray: RING, strokeDashoffset: live || reduced ? RING * (1 - repaid) : RING }} />
          </svg>
          <div className="hm-donut-center">
            <small>Balance</small>
            <strong key={`b-${pick}`}>{rupees(row.balance)}</strong>
            <span>{Math.round(repaid * 100)}% repaid</span>
          </div>
        </div>
        <div className="hm-receipt-split" aria-live="polite">
          <p className="hm-split-title"><span>{row.month} receipt</span><strong>{rupees(row.total)}</strong></p>
          {parts.map(part => <div key={part.key} className={`hm-split-row is-${part.key}`}>
            <p><span>{part.label}</span><strong>{part.value ? rupees(part.value) : "—"}</strong></p>
            <div className="hm-split-track"><i style={{ width: `${(part.value / row.total) * 100}%` }} /></div>
          </div>)}
          <p className="hm-split-earned"><span>Interest and penalty earned so far</span><strong>{rupees(earned)}</strong></p>
        </div>
      </div>
      <ol className="hm-steps" aria-label="Receipts by month">
        {MONTHLY_ROWS.map((item, index) => <li key={item.month} data-state={index < pick ? "done" : index === pick ? "now" : "next"}>
          <button type="button" aria-pressed={index === pick} onClick={() => setChosen(index)}>
            <i aria-hidden="true" />{item.month}{item.penalty ? <em aria-label="with penalty">+P</em> : null}
          </button>
        </li>)}
      </ol>
    </div>
    <div className="hm-module-copy">
      <Tag icon={CalendarRange}>Monthly Finance</Tag>
      <h3>Interest, principal, and penalty never mix.</h3>
      <p className="hm-module-lead">Every receipt on a monthly account records what it covered, so the balance and the interest you earned are always clear.</p>
      <Points items={["Monthly interest accounts with due amounts", "Each receipt split into interest, principal, and penalty", "Monthly P&L from interest and penalty received", "Upcoming payment reminders"]} />
      <More to={featurePath("monthly-finance")}>Explore Monthly Finance</More>
    </div>
  </article></Section>;
}

/* ------------------------------------------------------------------- Chit Fund */
const CHIT_BIDS = [
  { member: "Ticket 07 · Ramesh", discount: 18500 },
  { member: "Ticket 12 · Kavitha", discount: 22000 },
  { member: "Ticket 03 · Mahesh", discount: 25500 },
  { member: "Ticket 15 · Savitha N", discount: 29500 },
];
const CHIT_VALUE = 200000;

function ChitModule() {
  const [ref, live, reduced] = useLive();
  const step = useLoop(live, CHIT_BIDS.length + 1, 1500, 3200);
  const shownBids = reduced ? CHIT_BIDS.length : Math.min(step + 1, CHIT_BIDS.length);
  const closed = reduced || step === CHIT_BIDS.length;
  const top = CHIT_BIDS[shownBids - 1];
  return <Section id="chit-fund"><article ref={ref} className="hm-module hm-chit" data-mod="chit" data-live={live}>
    <div className="hm-chit-stage" aria-hidden="true">
      <div className="hm-chit-top">
        <span className="hm-live" data-closed={closed}><i /> {closed ? "Auction closed" : "Live bidding"}</span>
        <span>Gold 2 Lakh · Month 6</span>
      </div>
      <div className="hm-chit-main">
        <div className="hm-ring" data-closed={closed}>
          <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" /><circle key={step} className="hm-ring-run" cx="60" cy="60" r="52" /></svg>
          <span><Gavel size={26} /></span>
        </div>
        <div className="hm-chit-bid">
          <small>{closed ? "Lift confirmed" : "Highest discount"}</small>
          <strong key={top.discount}>{rupees(top.discount)}</strong>
          <span>{top.member}</span>
        </div>
      </div>
      <ul className="hm-bids">
        {CHIT_BIDS.slice(0, shownBids).reverse().map((bid, index) => <li key={bid.member} className={index === 0 ? "is-top" : ""}>
          <span>{bid.member}</span><strong>{rupees(bid.discount)}</strong>
        </li>)}
      </ul>
      <div className="hm-chit-facts">
        <span><small>Chit value</small>{rupees(CHIT_VALUE)}</span>
        <span><small>Lift amount</small>{rupees(CHIT_VALUE - top.discount)}</span>
        <span><small>Members</small>20</span>
      </div>
    </div>
    <div className="hm-module-copy">
      <Tag icon={Coins}>Chit Fund</Tag>
      <h3>Auctions, dividends, and statements without the register.</h3>
      <p className="hm-module-lead">Run auction and fixed schemes. Enroll members, open the month, take live bids, and confirm the close.</p>
      <Points items={["Auction and fixed schemes with member tickets", "Live bidding that skips members who already won", "Commission and dividend from the scheme rules", "Month statement PDF and scheme health"]} />
      <More to={featurePath("auction-chit")}>Explore Chit Fund</More>
    </div>
  </article></Section>;
}

/* -------------------------------------------------------------------- Cashbook */
const CASH_TILES = [
  { key: "cash", label: "Cash in hand", value: 28350, bars: [40, 62, 48, 70, 56, 80, 66] },
  { key: "bank", label: "Bank", value: 368200, bars: [55, 48, 66, 60, 74, 68, 86] },
  { key: "upi", label: "UPI", value: 423630, bars: [30, 46, 58, 52, 70, 78, 92] },
];
const CASH_ENTRIES = [
  { text: "Collection · Anjali Reddy", amount: "+₹180", kind: "in" },
  { text: "Office rent · October", amount: "−₹12,000", kind: "out" },
  { text: "Transfer · cash to HDFC", amount: "₹20,000", kind: "move" },
  { text: "UPI · Lakshmi Devi", amount: "+₹240", kind: "in" },
  { text: "Fuel · collection bike", amount: "−₹450", kind: "out" },
  { text: "Chit installment · Ticket 07", amount: "+₹10,000", kind: "in" },
  { text: "Electricity bill", amount: "−₹2,500", kind: "out" },
];

function CashTile({ tile, live, reduced, index }) {
  const value = useCount(live, tile.value, 1300 + index * 250);
  return <div className={`hm-cash-tile is-${tile.key}`} style={{ "--i": index }}>
    <small>{tile.label}</small>
    <strong>{rupees(reduced ? tile.value : value)}</strong>
    <div className="hm-bars">{tile.bars.map((height, bar) => <i key={bar} style={{ "--h": `${height}%`, "--b": bar }} />)}</div>
  </div>;
}

function CashbookModule() {
  const [ref, live, reduced] = useLive();
  return <Section id="cashbook" flip><article ref={ref} className="hm-cashbook" data-mod="cash" data-live={live || reduced}>
    <div className="hm-cash-copy">
      <Tag icon={Wallet}>Cashbook</Tag>
      <h3>Cash, bank, and UPI, closed every day.</h3>
      <p className="hm-module-lead">Write the day’s cash, expense, bank, and transfer lines in a cashbook that can stand on its own.</p>
      <Points items={["Cash, bank, and UPI balances at a glance", "Expense and transfer lines kept apart", "Moves into the finance company only when you Sync"]} />
      <More to={featurePath("cashbook")}>Explore Cashbook</More>
    </div>
    {CASH_TILES.map((tile, index) => <CashTile key={tile.key} tile={tile} live={live} reduced={reduced} index={index} />)}
    <div className="hm-cash-feed" aria-hidden="true">
      <div className="hm-cash-feed-head"><span>Day book</span><span className="hm-cash-sync"><i /> Closed today</span></div>
      <div className="hm-cash-window">
        <ul>
          {[...CASH_ENTRIES, ...CASH_ENTRIES].map((entry, index) => <li key={index} className={`is-${entry.kind}`}>
            <span>{entry.text}</span><strong>{entry.amount}</strong>
          </li>)}
        </ul>
      </div>
    </div>
  </article></Section>;
}

/* -------------------------------------------------------------------- Accounts */
const POS_LINES = [
  { item: "Sunflower Oil 1L × 2", amount: 340 },
  { item: "Basmati Rice 5kg", amount: 625 },
  { item: "Toor Dal 1kg", amount: 160 },
  { item: "Tea Powder 250g", amount: 145 },
];
const POS_SUBTOTAL = POS_LINES.reduce((sum, line) => sum + line.amount, 0);
const POS_GST = Math.round(POS_SUBTOTAL * 0.05);
const ACCOUNT_CHIPS = [
  { icon: FileText, label: "Vouchers" },
  { icon: Package, label: "Inventory" },
  { icon: Users, label: "Payroll" },
  { icon: Scale, label: "Bank matching" },
  { icon: Receipt, label: "GST pack for your CA" },
];
const ACCOUNT_REPORTS = ["Balance sheet", "Profit & loss", "Trial balance"];

function AccountsModule() {
  const [ref, live, reduced] = useLive();
  const step = useLoop(live, POS_LINES.length + 2, 750, 3200);
  const lines = reduced ? POS_LINES.length : Math.min(step, POS_LINES.length);
  const charged = reduced || step === POS_LINES.length + 1;
  const subtotal = POS_LINES.slice(0, lines).reduce((sum, line) => sum + line.amount, 0);
  return <Section id="accounts"><article ref={ref} className="hm-accounts" data-mod="accounts" data-live={live || reduced}>
    <header className="hm-accounts-head">
      <Tag icon={BookOpenText}>Accounts</Tag>
      <h3>Full company books, with a billing counter built in.</h3>
      <p className="hm-module-lead">Bill from Counter POS, post vouchers, keep stock and payroll, attach bill proofs, back up the workspace, and hand a GST-ready month to your CA.</p>
    </header>
    <div className="hm-accounts-stage" aria-hidden="true">
      <ul className="hm-chips">
        {ACCOUNT_CHIPS.map((chip, index) => <li key={chip.label} style={{ "--i": index }}><chip.icon size={16} />{chip.label}</li>)}
      </ul>
      <div className="hm-pos">
        <div className="hm-pos-printer"><Printer size={16} /> Counter POS</div>
        <div className="hm-pos-paper">
          <p className="hm-pos-shop">Sri Lakshmi Traders</p>
          <ul>
            {POS_LINES.slice(0, lines).map(line => <li key={line.item}><span>{line.item}</span><span>{rupees(line.amount)}</span></li>)}
          </ul>
          <div className="hm-pos-sum">
            <span><span>GST 5%</span><span>{lines === POS_LINES.length ? rupees(POS_GST) : "—"}</span></span>
            <strong><span>Total</span><span>{rupees(subtotal + (lines === POS_LINES.length ? POS_GST : 0))}</span></strong>
          </div>
          <p className="hm-pos-done" data-show={charged}><Check size={14} strokeWidth={3} /> Charged · posted to books</p>
        </div>
      </div>
      <div className="hm-reports">
        {ACCOUNT_REPORTS.map((report, index) => <div key={report} className="hm-report" style={{ "--i": index }}>
          <small>Report</small><strong>{report}</strong>
          <span className="hm-report-lines"><i /><i /><i /></span>
        </div>)}
      </div>
    </div>
    <div className="hm-accounts-foot">
      <Points items={["Counter POS with till alerts, thermal, and WhatsApp receipts", "Bill proofs on expenses and workspace backup", "Expired stock alerts with inventory and the books", "Trial balance, P&L, balance sheet, and cash flow"]} />
      <More to={featurePath("accounts-overview")}>Explore Accounts</More>
    </div>
  </article></Section>;
}

export function HomeModules() {
  return <>
    <DailyModule />
    <MonthlyModule />
    <ChitModule />
    <CashbookModule />
    <AccountsModule />
  </>;
}
