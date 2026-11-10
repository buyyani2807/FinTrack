import { useEffect } from "react";
import { FileText, MessageCircle, Receipt } from "lucide-react";
import { RevealProvider } from "../../components/ui/Reveal.jsx";
import { ModuleParts } from "./ModuleParts.jsx";
import { ModeSwitch, ModuleClosing, ModuleFaq, ModuleHero, SectionHead, Tile } from "./ModuleKit.jsx";

// Sample figures in the tile pictures match the demo workspace in the product screenshots.
const LIST = [
  { initials: "AR", name: "Anjali Reddy", amount: "₹180", paid: true },
  { initials: "PR", name: "Padma Rao", amount: "₹100", paid: true },
  { initials: "RK", name: "Ravi Kumar", amount: "₹120", paid: false },
  { initials: "LD", name: "Lakshmi Devi", amount: "₹240", paid: false },
];

const MODES = [
  { key: "daily", label: "Daily", slug: "daily-finance", scene: "finance-overview", line: "For 100-day style lending, collected every day." },
  { key: "monthly", label: "Monthly", slug: "monthly-finance", scene: "monthly", line: "For interest accounts, collected every month." },
];

export function FinancePage({ feature }) {
  useEffect(() => { document.title = "Finance — FinTrack"; }, []);
  return <RevealProvider intent="landing"><ModuleParts module="finance"><div className="hm-home fx">
    <ModuleHero name="Finance" title="Every loan and every collection, in one lending book." lead={feature.summary} appPath={feature.appPath} scene="finance" frameLabel="Daily Finance · Today’s collections" />

    <section className="fx-sec fx-bento-sec">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Inside Finance" title="Everything the lending book needs." />
        <div className="fx-bento">
          <Tile slug="collections" size="lg" title="See who has paid today, and who is still due.">
            <div className="fx-card fx-list">
              <div className="fx-list-head"><span>Today</span><strong>₹280 <small>of ₹640</small></strong></div>
              <div className="fx-bar"><i style={{ width: "44%" }} /></div>
              <ul>
                {LIST.map(row => <li key={row.name}>
                  <span className="fx-avatar">{row.initials}</span>
                  <span className="fx-name">{row.name}</span>
                  <span className="fx-amt">{row.amount}</span>
                  <span className={`fx-pill${row.paid ? " is-on" : ""}`}>{row.paid ? "Paid" : "Due"}</span>
                </li>)}
              </ul>
            </div>
          </Tile>
          <Tile slug="customers" size="wide" title="Every account and its history, for each customer.">
            <div className="fx-card fx-customer">
              <span className="fx-avatar is-lg">LD</span>
              <div className="fx-customer-name"><strong>Lakshmi Devi</strong><span>Daily account · Route 2</span></div>
              <dl>
                <div><dt>Financed</dt><dd>₹10,000</dd></div>
                <div><dt>Paid</dt><dd>₹5,760</dd></div>
                <div><dt>Balance</dt><dd>₹4,240</dd></div>
              </dl>
            </div>
          </Tile>
          <Tile slug="finance-reports" title="Daily and Monthly P&L for the lending book.">
            <div className="fx-spark">
              <span>Collected this week</span>
              <svg viewBox="0 0 160 60" preserveAspectRatio="none"><polyline points="0,48 26,40 52,44 78,28 104,32 130,16 160,10" /></svg>
            </div>
          </Tile>
          <Tile slug="collection-staff" title="Agents see only the accounts you assign.">
            <div className="fx-staff">
              <div className="fx-faces"><span className="fx-avatar">SN</span><span className="fx-avatar">PG</span><span className="fx-avatar">MR</span></div>
              <span className="fx-card fx-chip">Route 2 · 12 accounts</span>
            </div>
          </Tile>
          <Tile slug="digital-receipts" title="A receipt from the collection you just recorded.">
            <div className="fx-card fx-rows">
              <p><Receipt size={14} /> Receipt 1043</p>
              <p><span>Paid</span><strong>₹240</strong></p>
              <p><span>Balance</span><strong>₹4,000</strong></p>
            </div>
          </Tile>
          <Tile slug="whatsapp-reminders" title="Reminders that you send on WhatsApp.">
            <div className="fx-chat">
              <p className="fx-card fx-bubble">₹240 is due today. Please pay your agent or at the office.</p>
              <span className="fx-chat-note"><MessageCircle size={13} /> You tap Send</span>
            </div>
          </Tile>
          <Tile slug="customer-statements" title="A statement the customer can review.">
            <div className="fx-card fx-doc"><FileText size={18} /><i /><i /><i /><i /><span>PDF</span></div>
          </Tile>
          <Tile slug="credit-score" title="A score from the customer’s payment history.">
            <div className="fx-gauge">
              <svg viewBox="0 0 120 70"><path className="fx-gauge-track" d="M10,62 A50,50 0 0 1 110,62" /><path className="fx-gauge-value" d="M10,62 A50,50 0 0 1 96,30" /></svg>
              <strong>742</strong>
            </div>
          </Tile>
        </div>
      </div>
    </section>

    <section className="fx-sec hm-flip">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Two lending books" title="Daily or monthly. Switch and see how each works." />
        <ModeSwitch label="Lending book" modes={MODES} />
      </div>
    </section>

    <ModuleFaq title="Finance, answered." questions={["Can a finance business use it?", "What reports are included?", "Can I send WhatsApp messages?", "Can I install it on my phone?"]} />
    <ModuleClosing title="Put the whole lending book in one login." appPath={feature.appPath} points={["Daily and monthly accounts", "Collection staff access", "Daily and Monthly P&L"]} />
  </div></ModuleParts></RevealProvider>;
}
