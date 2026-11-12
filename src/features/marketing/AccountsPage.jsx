import { useEffect } from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowRight, Check, Paperclip } from "lucide-react";
import { Reveal, RevealProvider } from "../../components/ui/Reveal.jsx";
import { featureBySlug } from "./catalog.js";
import { FeatureIcon } from "./icons.jsx";
import { ModeSwitch, ModuleClosing, ModuleFaq, ModuleHero, SectionHead, Tile } from "./ModuleKit.jsx";
import { ModuleParts } from "./ModuleParts.jsx";
import { useFeaturePath, usePartLink } from "./moduleParts.js";

// Sample figures in the tile pictures; the till total is the sum of its lines.
const TILL = [
  { item: "Sunflower Oil 1L × 2", amount: "₹340" },
  { item: "Basmati Rice 5kg", amount: "₹625" },
  { item: "Toor Dal 1kg", amount: "₹160" },
];
const STOCK = [
  { item: "Basmati Rice 5kg", level: 80 },
  { item: "Sunflower Oil 1L", level: 55 },
  { item: "Toor Dal 1kg", level: 18, low: true },
];
const MORE = ["chart-of-accounts", "ledger", "trade-documents", "receivables", "party-profiles", "payables", "cashbook", "trial-balance", "expenses", "balance-sheet", "cash-flow", "item-profit", "audit-trail", "period-locking"];
const MODES = [
  { key: "sell", label: "Sell", slug: "counter-pos", scene: "accounts-counter", line: "Bill at the counter. The sale posts into the books and stock." },
  { key: "post", label: "Post", slug: "vouchers", scene: "accounts", line: "Receipts, payments, journals, sales, and purchases." },
  { key: "close", label: "Close", slug: "for-the-ca", scene: "accounts-gst", line: "Hand the month to your chartered accountant." },
];

function AlsoLink({ item }) {
  const openPart = usePartLink(item.slug);
  const to = useFeaturePath(item.slug);
  return <Link to={to} onClick={openPart} aria-haspopup={openPart ? "dialog" : undefined}><FeatureIcon name={item.icon} size={16} />{item.name}<ArrowRight size={14} aria-hidden="true" /></Link>;
}

export function AccountsPage({ feature }) {
  useEffect(() => { document.title = "Accounts — MyFinTracker"; }, []);
  const more = MORE.map(featureBySlug).filter(Boolean);
  return <RevealProvider intent="landing"><ModuleParts module="accounts-overview"><div className="hm-home fx">
    <ModuleHero
      name="Accounts"
      title="Billing, books, and GST preparation, in one company book."
      lead="Bill from Counter POS — including 48 hours offline — post vouchers, keep stock and payroll, attach bill proofs, and hand a GST-ready month to your CA."
      appPath={feature.appPath}
      scene="accounts-overview"
      frameLabel="Accounts · Overview"
    />

    <section className="fx-sec fx-bento-sec">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Inside Accounts" title="Everything the company book needs." />
        <div className="fx-bento">
          <Tile slug="counter-pos" size="lg" title="Bill walk-in and khata sales — including 48 hours offline.">
            <div className="fx-card fx-list fx-till">
              <div className="fx-list-head"><span>Counter · Bill 214</span><strong>₹1,125</strong></div>
              <ul>
                {TILL.map(line => <li key={line.item}><span className="fx-name">{line.item}</span><span className="fx-amt">{line.amount}</span></li>)}
              </ul>
              <div className="fx-tenders"><span className="fx-pill is-on">Cash</span><span className="fx-pill">UPI</span><span className="fx-pill">Khata</span></div>
              <span className="fx-charge">Charge ₹1,125</span>
            </div>
          </Tile>
          <Tile slug="vouchers" size="wide" title="Vouchers save only when debit equals credit.">
            <div className="fx-card fx-voucher">
              <div className="fx-voucher-head"><strong>Sales voucher</strong><span className="fx-pill is-on"><Check size={12} strokeWidth={3} /> Balanced</span></div>
              <div className="fx-voucher-grid">
                <span>Ledger</span><span>Debit</span><span>Credit</span>
                <b>Cash</b><b>₹1,125</b><b>—</b>
                <b>Sales</b><b>—</b><b>₹1,125</b>
              </div>
            </div>
          </Tile>
          <Tile slug="inventory" title="Stock and item sales, kept with the books.">
            <div className="fx-card fx-stock">
              {STOCK.map(row => <div key={row.item}><span>{row.item}{row.low ? <b className="fx-pill">Low</b> : null}</span><i><em style={{ width: `${row.level}%` }} /></i></div>)}
            </div>
          </Tile>
          <Tile slug="payroll" title="Pay staff with attendance, leave, and a payslip.">
            <div className="fx-card fx-rows">
              <p>Payslip · October</p>
              <p><span>Basic</span><strong>₹18,000</strong></p>
              <p><span>HRA</span><strong>₹4,000</strong></p>
              <p className="is-total"><span>Net</span><strong>₹22,000</strong></p>
            </div>
          </Tile>
          <Tile slug="gst-preparation" title="GST summaries from posted vouchers.">
            <div className="fx-card fx-rows">
              <p>GST pack · October</p>
              <p><span>Output tax</span><strong>₹8,450</strong></p>
              <p><span>Eligible ITC</span><strong>₹5,120</strong></p>
              <p className="is-total"><span>Net payable</span><strong>₹3,330</strong></p>
            </div>
          </Tile>
          <Tile slug="bank-reconciliation" title="Match statement lines to vouchers you accept.">
            <div className="fx-match">
              <span className="fx-card fx-chip">HDFC · ₹1,125 in</span>
              <span className="fx-pill is-on">Suggested match</span>
              <span className="fx-card fx-chip">Receipt · ₹1,125</span>
            </div>
          </Tile>
          <Tile slug="profit-and-loss" title="Income, expenses, and net profit for the period.">
            <div className="fx-spark">
              <span>Net profit by month</span>
              <svg viewBox="0 0 160 60" preserveAspectRatio="none"><polyline points="0,44 26,46 52,36 78,38 104,24 130,22 160,12" /></svg>
            </div>
          </Tile>
          <Tile slug="for-the-ca" title="One page to hand the month to your CA.">
            <div className="fx-card fx-rows fx-checks">
              <p>For the CA · October</p>
              <p><Check size={14} strokeWidth={3} /><span>Trial balance agrees</span></p>
              <p><Check size={14} strokeWidth={3} /><span>Invoices reviewed</span></p>
              <p><Check size={14} strokeWidth={3} /><span>Bank lines matched</span></p>
            </div>
          </Tile>
          <Tile slug="bill-proofs" title="A photo or PDF of the supplier bill, kept on the expense.">
            <div className="fx-card fx-rows fx-checks">
              <p><Paperclip size={14} /> Bill proof</p>
              <p><Check size={14} strokeWidth={3} /><span>Photo or PDF on the voucher</span></p>
              <p><Check size={14} strokeWidth={3} /><span>Ready for audit</span></p>
              <p><span className="fx-off">—</span><span>Does not post a second entry</span></p>
            </div>
          </Tile>
          <Tile slug="expired-stock" title="Items past expiry or due within 30 days — from the date on the item.">
            <div className="fx-card fx-rows fx-flags">
              <p><AlertTriangle size={14} /> Expired stock</p>
              <p><span>Burma Paper · tomorrow</span></p>
              <p><span>China Coat · in 9 days</span></p>
              <p><span>Pull from sale. Dates, not a forecast.</span></p>
            </div>
          </Tile>
        </div>
        <div className="fx-also">
          <Reveal as="p" className="fx-eyebrow">Also in Accounts</Reveal>
          <ul>
            {more.map(item => <li key={item.slug}><AlsoLink item={item} /></li>)}
          </ul>
        </div>
      </div>
    </section>

    <section className="fx-sec hm-flip">
      <div className="mkt-wrap">
        <SectionHead eyebrow="A day in Accounts" title="Sell, post, and close the month." />
        <ModeSwitch label="Daily work" modes={MODES} />
      </div>
    </section>

    <ModuleFaq title="Accounts, answered." questions={["Can I use it only for accounting?", "Does it have a POS / billing counter?", "Can I bill without internet?", "Can I keep a bill as proof?"]} />
    <ModuleClosing title="Keep the company book in one login." appPath={feature.appPath} points={["Counter POS with 48-hour offline billing", "Bill proofs on expenses", "A page for your CA"]} />
  </div></ModuleParts></RevealProvider>;
}
