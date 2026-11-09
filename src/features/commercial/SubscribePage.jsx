import { useMemo } from "react";
import { Link, useOutletContext } from "react-router";
import { catalogWithPurchaseState } from "./moduleAccess.js";
import { priceForPeriod, priceForProduct } from "./moduleProducts.js";
import {
  formatTrialDate,
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
  const started = formatTrialDate(subscription?.startedAt);
  const ends = formatTrialDate(subscription?.endsAt);
  const modules = useMemo(() => catalogWithPurchaseState(moduleState), [moduleState]);
  const monthly = priceForPeriod("monthly");
  const annual = priceForPeriod("annual");
  const posMonthly = priceForProduct("accounts_pos", "monthly");

  return <main className="ft-subscribe">
    <p className="ft-kicker">Subscription</p>
    <h1>{ended ? ended.title : trial ? "Your 14-day free trial is running" : "Unlock modules"}</h1>
    {ended ? <p className="ft-subscribe-lead">{ended.preservation}</p> : <p className="ft-subscribe-lead">
      {trial
        ? `${trial.detail} After the trial, unlock only the modules you need.`
        : "Unlock Daily + Monthly Finance, Chit Fund, Accounts, or Accounts + POS for this business."}
      {" "}Your records stay either way.
    </p>}
    {(started || ends) && <p className="ft-subscribe-dates">
      {started ? <>Trial started {started}. </> : null}
      {ends ? <>Trial ends {ends}.</> : null}
    </p>}

    <section className="ft-subscribe-modules">
      <h2>{ended ? "Modules" : "Your modules"}</h2>
      <p className="small">
        Standard modules: {monthly.breakdown} monthly, or {annual.breakdown} yearly.
        Accounts + POS: {posMonthly.breakdown}. No lifetime plan.
      </p>
      <ul className="ft-module-billing-list">
        {modules.map(product => {
          const price = priceForProduct(product, "monthly");
          return (
          <li key={product.key} className={product.owned ? "is-owned" : "is-locked"}>
            <strong>{product.name}</strong>
            <span>{product.owned ? "Active" : "Locked"} · {price.totalLabel}/mo</span>
          </li>
          );
        })}
      </ul>
      {isOwner ? (
        <p><Link className="btn primary" to="/subscribe/modules">Unlock modules</Link></p>
      ) : (
        <p>The business owner unlocks modules.</p>
      )}
    </section>

    <section className="ft-subscribe-help">
      <h2>Payment</h2>
      <p>Card payment is not connected yet. Unlock does not charge a card until Razorpay is configured on the server. Modules unlock only after a verified payment event.</p>
      <h2>Questions</h2>
      <p>Will my records be removed? No. Customers, collections, chit records, and accounts stay in this workspace.</p>
      <p>Can I still sign in? Yes. Sign-in, this page, company settings, and log out stay available.</p>
      <p>When does the trial start? After the workspace is created, for 14 days. Opening the signup page does not start it.</p>
      {workspaceAccessAllowed(subscription) ? <p><Link to="/dashboard">Back to the workspace</Link></p> : null}
      <button type="button" className="btn" onClick={logout}>Log out</button>
    </section>
  </main>;
}
