import { useEffect } from "react";
import { FileText } from "lucide-react";
import { RevealProvider } from "../../components/ui/Reveal.jsx";
import { ModuleParts } from "./ModuleParts.jsx";
import { ModeSwitch, ModuleClosing, ModuleFaq, ModuleHero, SectionHead, Tile } from "./ModuleKit.jsx";

// Sample figures match the Gold 2 Lakh scheme in the product screenshots.
const BIDS = [
  { ticket: "Ticket 15 · Savitha N", amount: "₹29,500" },
  { ticket: "Ticket 03 · Mahesh", amount: "₹25,500" },
  { ticket: "Ticket 12 · Kavitha", amount: "₹22,000" },
];
const LIFTED = new Set([2, 5, 7, 11, 15]);
const MODES = [
  { key: "auction", label: "Auction", slug: "auction-chit", scene: "chit-live", line: "Monthly bids or live bidding decide each month." },
  { key: "fixed", label: "Fixed", slug: "fixed-chit", scene: "chit", line: "A set lift schedule decides each month instead of bidding." },
];

export function ChitPage({ feature }) {
  useEffect(() => { document.title = "Chit Fund — FinTrack"; }, []);
  return <RevealProvider intent="landing"><ModuleParts module="auction-chit"><div className="hm-home fx">
    <ModuleHero
      name="Chit Fund"
      title="Every scheme, bid, and dividend, in one chit book."
      lead="Run auction and fixed schemes with members, monthly bids, and live bidding. Commission and dividend follow the scheme rules."
      appPath={feature.appPath}
      scene="chit-scheme"
      frameLabel="Chit Fund · Gold 2 Lakh · Apr 2026"
    />

    <section className="fx-sec fx-bento-sec">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Inside Chit Fund" title="Everything a chit scheme needs." />
        <div className="fx-bento">
          <Tile slug="live-bidding" size="lg" title="Open a month and keep the highest bid in view.">
            <div className="fx-card fx-list">
              <div className="fx-list-head"><span className="fx-live"><i /> Live · Month 6</span><strong>₹29,500 <small>highest</small></strong></div>
              <div className="fx-bar"><i style={{ width: "68%" }} /></div>
              <ul>
                {BIDS.map((bid, index) => <li key={bid.ticket} className={index === 0 ? "is-top" : ""}>
                  <span className="fx-name">{bid.ticket}</span>
                  <span className="fx-amt">{bid.amount}</span>
                  <span className={`fx-pill${index === 0 ? " is-on" : ""}`}>{index === 0 ? "Highest" : "Bid"}</span>
                </li>)}
              </ul>
            </div>
          </Tile>
          <Tile slug="chit-members" size="wide" title="Members, tickets, and guarantors on each scheme.">
            <div className="fx-card fx-tickets">
              <div className="fx-tickets-head"><strong>Gold 2 Lakh</strong><span>20 of 20 members</span></div>
              <div className="fx-ticket-grid">
                {Array.from({ length: 20 }, (_, i) => <span key={i} className={LIFTED.has(i + 1) ? "is-on" : ""}>{String(i + 1).padStart(2, "0")}</span>)}
              </div>
              <p className="fx-legend"><i className="is-on" /> Lifted <i /> Still to lift</p>
            </div>
          </Tile>
          <Tile slug="chit-payments" title="The installment due for each member, month by month.">
            <div className="fx-card fx-rows">
              <p>Month 6 · ₹10,000 each</p>
              <p><span>Savitha N</span><b className="fx-pill is-on">Paid</b></p>
              <p><span>Mahesh</span><b className="fx-pill is-on">Paid</b></p>
              <p><span>Kavitha</span><b className="fx-pill">Due</b></p>
            </div>
          </Tile>
          <Tile slug="dividends" title="Discount, commission, and dividend for the month.">
            <div className="fx-card fx-rows">
              <p>Month 6 dividend</p>
              <p><span>Discount</span><strong>₹29,500</strong></p>
              <p><span>Commission</span><strong>−₹10,000</strong></p>
              <p className="is-total"><span>Each of 20</span><strong>₹975</strong></p>
            </div>
          </Tile>
          <Tile slug="auction-chit" title="Auction schemes with members and monthly bids.">
            <div className="fx-card fx-rows">
              <p>Gold 2 Lakh</p>
              <p><span>Chit value</span><strong>₹2,00,000</strong></p>
              <p><span>Installment</span><strong>₹10,000</strong></p>
              <p><span>Members</span><strong>20</strong></p>
            </div>
          </Tile>
          <Tile slug="fixed-chit" title="A set lift schedule instead of live bidding.">
            <div className="fx-card fx-rows">
              <p>Lift schedule</p>
              <p><span>Month 1</span><strong>Ticket 01</strong></p>
              <p><span>Month 2</span><strong>Ticket 02</strong></p>
              <p><span>Month 3</span><strong>Ticket 03</strong></p>
            </div>
          </Tile>
          <Tile slug="chit-statements" title="A statement of the member’s scheme and payments.">
            <div className="fx-card fx-doc"><FileText size={18} /><i /><i /><i /><i /><span>PDF</span></div>
          </Tile>
          <Tile slug="chit-reports" title="Month statements, commission income, and scheme health.">
            <div className="fx-chart">
              <span>Expected and collected</span>
              <div className="fx-chart-bars">
                {[[90, 82], [90, 88], [90, 76], [90, 90], [90, 84], [90, 70]].map(([a, b], i) => <div key={i}><i style={{ height: `${a}%` }} /><i className="is-on" style={{ height: `${b}%` }} /></div>)}
              </div>
            </div>
          </Tile>
        </div>
      </div>
    </section>

    <section className="fx-sec hm-flip">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Two kinds of scheme" title="Auction or fixed. Switch and see how each runs." />
        <ModeSwitch label="Scheme type" modes={MODES} />
      </div>
    </section>

    <ModuleFaq title="Chit funds, answered." questions={["Does it support chit funds?", "What reports are included?", "Can I send WhatsApp messages?", "Can I install it on my phone?"]} />
    <ModuleClosing title="Run every chit scheme in one login." appPath={feature.appPath} points={["Auction and fixed schemes", "Live bidding", "Month statements and reports"]} />
  </div></ModuleParts></RevealProvider>;
}
