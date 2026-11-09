import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { catalogWithPurchaseState } from "./moduleAccess.js";
import { formatModulePrice } from "./moduleProducts.js";
import {
  SUBSCRIPTION_PLANS,
  formatTrialDate,
  paidActivationFromButton,
  subscriptionLockCopy,
  trialBannerCopy,
  workspaceAccessAllowed,
} from "./trial.js";

export function SubscribePage() {
  const { workspace, logout, moduleState, access } = useOutletContext() || {};
  const subscription = workspace?.subscription;
  const isOwner = access?.isOwner || workspace?.role === "owner";
  const ended = subscriptionLockCopy(subscription);
  const trial = trialBannerCopy(subscription);
  const [notice, setNotice] = useState("");
  const started = formatTrialDate(subscription?.startedAt);
  const ends = formatTrialDate(subscription?.endsAt);
  const modules = useMemo(() => catalogWithPurchaseState(moduleState), [moduleState]);

  const choosePlan = () => {
    const result = paidActivationFromButton();
    setNotice(result.reason);
  };

  return <main className="ft-subscribe">
    <p className="ft-kicker">Subscription</p>
    <h1>{ended ? ended.title : trial ? "Your 14-day free trial is running" : "Choose a plan"}</h1>
    {ended ? <p className="ft-subscribe-lead">{ended.preservation}</p> : <p className="ft-subscribe-lead">
      {trial
        ? `${trial.detail} After the trial you can keep a full plan or unlock modules individually.`
        : "Keep a workspace plan, or unlock Daily + Monthly Finance, Chit Fund, Accounts, and Accounts + POS as separate modules."}
      {" "}Your records stay either way. The free trial still opens every module for 14 days.
    </p>}
    {(started || ends) && <p className="ft-subscribe-dates">
      {started ? <>Trial started {started}. </> : null}
      {ends ? <>Trial ends {ends}.</> : null}
    </p>}

    <section className="ft-subscribe-modules">
      <h2>Purchased modules</h2>
      <ul className="ft-module-billing-list">
        {modules.map(product => {
          const price = formatModulePrice(product);
          return (
            <li key={product.key} className={product.owned ? "is-owned" : "is-locked"}>
              <strong>{product.name}</strong>
              <span>{product.owned ? "Active" : "Locked"} · {price.display}</span>
            </li>
          );
        })}
      </ul>
      {isOwner ? <p><Link className="btn primary" to="/subscribe/modules">Unlock modules</Link></p> : null}
    </section>

    <div className="ft-plan-grid">
      {SUBSCRIPTION_PLANS.map(plan => <article key={plan.id} className="ft-plan-card">
        <h2>{plan.name}</h2>
        <p className="ft-plan-price">{plan.price} <span>/ {plan.period}</span></p>
        <p>{plan.note}</p>
        <ul>
          <li>Daily Finance and Monthly Finance</li>
          <li>Chit Fund</li>
          <li>Accounts and cashbook</li>
        </ul>
        {isOwner
          ? <button type="button" className="btn primary" onClick={choosePlan}>Subscribe</button>
          : <p>The business owner chooses the plan.</p>}
      </article>)}
    </div>
    {notice && <p className="ft-subscribe-note" role="status">{notice}</p>}
    <section className="ft-subscribe-help">
      <h2>Payment</h2>
      <p>Card payment is not connected yet. Subscribe and module Unlock do not charge a card until Razorpay is configured on the server. Entitlements are created only after a verified payment event.</p>
      <h2>Questions</h2>
      <p>Will my records be removed? No. Customers, collections, chit records, and accounts stay in this workspace.</p>
      <p>Can I still sign in? Yes. Sign-in, this page, company settings, and log out stay available.</p>
      <p>When does the trial start? After the workspace is created, for 14 days. Opening the signup page does not start it.</p>
      <p>Module price: ₹498 + GST 18% per month, or ₹5,976 + GST 18% per year, per module/bundle. No lifetime plan.</p>
      {workspaceAccessAllowed(subscription) ? <p><Link to="/dashboard">Back to the workspace</Link></p> : null}
      <button type="button" className="btn" onClick={logout}>Log out</button>
    </section>
  </main>;
}
