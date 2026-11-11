import { useEffect } from "react";
import { Check } from "lucide-react";
import { RevealProvider } from "../../components/ui/Reveal.jsx";
import { SECURITY_POINTS, SECURITY_TRUST } from "./catalog.js";
import { FeatureIcon } from "./icons.jsx";
import { ModeSwitch, ModuleClosing, ModuleFaq, ModuleHero, SectionHead, Tile } from "./ModuleKit.jsx";
import { ModuleParts } from "./ModuleParts.jsx";

const point = title => SECURITY_POINTS.find(item => item.title === title).text;

const MODES = [
  { key: "agent", label: "Agent", slug: "agent-portal", scene: "login", line: "An agent ID and PIN open only the accounts and routes you assign." },
  { key: "customer", label: "Customer", slug: "customer-portals", scene: "login", line: "A portal ID and PIN show one finance customer their own account." },
  { key: "member", label: "Member", slug: "member-portals", scene: "login", line: "A member sees their own ticket and payments, and bids when the auction is open." },
];

const QUESTIONS = [
  { question: "Who can sign in?", answer: point("Sign-in for each role") },
  { question: "Can one login see another business?", answer: `${point("Workspace isolation")} ${point("Company separation in Accounts")}` },
  { question: "Does Cashbook post into Accounts by itself?", answer: point("Integration stays off until you sync") },
  { question: "Does the AI change my books?", answer: `${point("Suggestions wait for you")} ${point("AI that stays inside your records")}` },
];

export function SecurityPage() {
  useEffect(() => { document.title = "Security — MyFinTracker"; }, []);
  return <RevealProvider intent="landing"><ModuleParts module="security"><div className="hm-home fx">
    <ModuleHero
      name="Security"
      title="Access, isolation, and review."
      lead="Each role signs in on its own. Records stay in your workspace, a voucher posts only when it balances, and a suggestion waits until you confirm it."
      appPath="/dashboard"
      scene="login"
      frameLabel="Sign in · Owner, agent, customer, member"
    />

    <section className="fx-sec fx-bento-sec">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Inside Security" title="The controls that are in the product today." />
        <div className="fx-bento">
          <Tile tag="Sign-in" size="lg" title="Owner, agent, customer, and member each sign in separately.">
            <div className="fx-card fx-rows">
              <p>Same sign-in screen</p>
              <p><span>Owner</span><strong>Email</strong></p>
              <p><span>Collection agent</span><strong>ID + PIN</strong></p>
              <p><span>Customer</span><strong>Portal + PIN</strong></p>
              <p><span>Chit member</span><strong>Portal + PIN</strong></p>
            </div>
          </Tile>
          <Tile tag="Workspace" size="wide" title="Another organisation’s records are not part of this login.">
            <div className="fx-card fx-rows">
              <p>This login</p>
              <p><span>Your customers, schemes, and vouchers</span></p>
              <p><span>Another organisation</span><b className="fx-pill">Not included</b></p>
            </div>
          </Tile>
          <Tile slug="audit-trail" title="A trail of accounting changes you can review.">
            <div className="fx-card fx-rows fx-checks">
              <p>Audit trail</p>
              <p><Check size={14} strokeWidth={3} /><span>Who changed it</span></p>
              <p><Check size={14} strokeWidth={3} /><span>Before and after</span></p>
              <p><span>Does not rewrite the voucher</span></p>
            </div>
          </Tile>
          <Tile slug="period-locking" title="Lock a date range, and reopen it when you decide.">
            <div className="fx-card fx-rows">
              <p>Closed period</p>
              <p><span>April</span><b className="fx-pill is-on">Locked</b></p>
              <p><span>May</span><b className="fx-pill">Open</b></p>
            </div>
          </Tile>
          <Tile slug="vouchers" title="A voucher is saved only when debit equals credit.">
            <div className="fx-card fx-voucher">
              <div className="fx-voucher-head"><strong>Voucher</strong><span className="fx-pill is-on"><Check size={12} strokeWidth={3} /> Balanced</span></div>
              <div className="fx-voucher-grid">
                <span>Ledger</span><span>Debit</span><span>Credit</span>
                <b>Cash</b><b>₹1,125</b><b>—</b>
                <b>Sales</b><b>—</b><b>₹1,125</b>
              </div>
            </div>
          </Tile>
          <Tile tag="Permissions" title="An accountant can post, a viewer can read, and an agent stays on assigned routes.">
            <div className="fx-card fx-rows">
              <p>Inside Accounts</p>
              <p><span>Accountant</span><strong>Post</strong></p>
              <p><span>Viewer</span><strong>Read</strong></p>
              <p><span>Collection agent</span><strong>Assigned routes</strong></p>
            </div>
          </Tile>
          <Tile tag="Company" title="Reports and vouchers follow the company you have open.">
            <div className="fx-card fx-rows">
              <p>Accounts</p>
              <p><span>Open company</span><strong>This one</strong></p>
              <p><span>Another company</span><b className="fx-pill">Not replaced</b></p>
            </div>
          </Tile>
          <Tile slug="ai-review" title="Insights, drafts, and matches wait until you confirm them.">
            <div className="fx-card fx-rows fx-checks">
              <p>Waiting for you</p>
              <p><span>Bill draft</span><b className="fx-pill">Review</b></p>
              <p><span>Bank line</span><b className="fx-pill">Approve</b></p>
              <p><span>Ask Finny</span><b className="fx-pill">Read only</b></p>
            </div>
          </Tile>
        </div>
      </div>
    </section>

    <section className="fx-sec">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Security and trust" title="Encryption, limits, and what we do not do." />
        <div className="fx-bento">
          {SECURITY_TRUST.map(item => <Tile key={item.title} tag={item.title} title={item.text}>
            <div className="fx-card fx-rows fx-checks">
              <p><FeatureIcon name={item.icon} size={16} />{item.title}</p>
              <p><Check size={14} strokeWidth={3} /><span>In the product today</span></p>
            </div>
          </Tile>)}
        </div>
      </div>
    </section>

    <section className="fx-sec hm-flip">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Who signs in" title="Agent, customer, and chit member each have their own door." />
        <ModeSwitch label="Sign-in" modes={MODES} />
      </div>
    </section>

    <ModuleFaq title="Security, answered." items={QUESTIONS} />
    <ModuleClosing title="Keep each login to its own records." appPath="/dashboard" points={["Separate sign-in for each role", "Audit trail and period locks", "Suggestions wait until you confirm"]} />
  </div></ModuleParts></RevealProvider>;
}
