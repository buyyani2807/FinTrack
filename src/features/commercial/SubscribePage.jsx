import { useMemo } from "react";
import { Link, useOutletContext } from "react-router";
import { catalogWithPurchaseState } from "./moduleAccess.js";
import { priceForProduct } from "./moduleProducts.js";
import {
  formatTrialDate,
  subscriptionLockCopy,
  trialBannerCopy,
  workspaceAccessAllowed,
} from "./trial.js";

const QUESTIONS = [
  ["Will my records be removed?", "No. Customers, collections, chit records, and accounts stay in this workspace."],
  ["Can I still sign in?", "Yes. Sign-in, this page, company settings, and log out stay available."],
  ["When does the trial start?", "After the workspace is created, for 14 days. Opening the signup page does not start it."],
];

export function SubscribePage() {
  const { workspace, logout, moduleState, access } = useOutletContext() || {};
  const subscription = workspace?.subscription;
  const isOwner = access?.isOwner || workspace?.role === "owner";
  const ended = subscriptionLockCopy(subscription);
  const trial = trialBannerCopy(subscription);
  const started = formatTrialDate(subscription?.startedAt);
  const ends = formatTrialDate(subscription?.endsAt);
  const modules = useMemo(() => catalogWithPurchaseState(moduleState), [moduleState]);

  return <main className="ft-subscribe">
    <div className="ft-sub">
      <header className="ft-mod-head">
        <p className="ft-mod-kicker">Subscription</p>
        <h1>{ended ? ended.title : trial ? "Your 14-day free trial is running" : "Subscription status"}</h1>
        <p className="ft-sub-lead">
          {ended
            ? ended.preservation
            : trial
              ? `${trial.detail} After the trial, unlock only the modules you need. Your records stay.`
              : "See which modules are active for this business. To pay and unlock more, open Modules."}
        </p>
        {(started || ends) && <p className="ft-sub-dates">
          {started ? <span>Trial started {started}</span> : null}
          {ends ? <span>Trial ends {ends}</span> : null}
        </p>}
      </header>

      <div className="ft-sub-grid">
        {modules.map(product => {
          const price = priceForProduct(product, "monthly");
          return <article key={product.key} className={`ft-sub-card${product.owned ? " is-owned" : ""}`}>
            <p className={`ft-mod-state${product.owned ? " is-owned" : ""}`}>{product.owned ? "Active" : "Locked"}</p>
            <div className="ft-mod-title">
              <h2>{product.name}</h2>
              <p className="ft-mod-price"><strong>{price.baseLabel}</strong><span>/ month + GST</span></p>
            </div>
            <p className="ft-mod-desc">{product.description}</p>
          </article>;
        })}
      </div>

      <section className="ft-mod-review">
        {isOwner ? (
          <Link className="btn primary" to="/subscribe/modules">Unlock modules</Link>
        ) : (
          <p className="ft-mod-empty">The business owner unlocks modules.</p>
        )}
        <p className="ft-mod-note">Card payment is not connected yet. Unlock does not charge a card until Razorpay is configured on the server. Modules unlock only after a verified payment event.</p>
        <dl className="ft-sub-qa">
          {QUESTIONS.map(([question, answer]) => <div key={question}>
            <dt>{question}</dt>
            <dd>{answer}</dd>
          </div>)}
        </dl>
        {workspaceAccessAllowed(subscription) ? <p className="ft-mod-back"><Link to="/dashboard">Back to the workspace</Link></p> : null}
        <button type="button" className="btn" onClick={logout}>Log out</button>
      </section>
    </div>
  </main>;
}
