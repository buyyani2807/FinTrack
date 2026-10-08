import { useState } from "react";
import { Link, useOutletContext } from "react-router";
import { marketingPaths } from "../marketing/paths.js";
import {
  SUBSCRIPTION_PLANS,
  formatTrialDate,
  paidActivationFromButton,
  subscriptionLockCopy,
  trialBannerCopy,
} from "./trial.js";

export function SubscribePage() {
  const { workspace, logout } = useOutletContext() || {};
  const subscription = workspace?.subscription;
  const isOwner = workspace?.role === "owner";
  const ended = subscriptionLockCopy(subscription);
  const trial = trialBannerCopy(subscription);
  const [notice, setNotice] = useState("");
  const started = formatTrialDate(subscription?.startedAt);
  const ends = formatTrialDate(subscription?.endsAt);

  const choosePlan = () => {
    const result = paidActivationFromButton();
    setNotice(result.reason);
  };

  return <main className="ft-subscribe">
    <p className="ft-kicker">Subscription</p>
    <h1>{ended ? ended.title : trial ? "Your 14-day free trial is running" : "Choose a plan"}</h1>
    {ended ? <p className="ft-subscribe-lead">{ended.preservation}</p> : <p className="ft-subscribe-lead">
      {trial ? trial.detail : "One plan includes Daily Finance, Monthly Finance, Chit Fund, and Accounts."}
      {" "}Your records stay either way.
    </p>}
    {(started || ends) && <p className="ft-subscribe-dates">
      {started ? <>Trial started {started}. </> : null}
      {ends ? <>Trial ends {ends}.</> : null}
    </p>}
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
      <p>Card payment is not connected yet. Subscribe does not charge a card and does not mark this workspace as paid. A verified payment-provider event has to arrive on the server before a plan becomes active.</p>
      <h2>Questions</h2>
      <p>Will my records be removed? No. Customers, collections, chit records, and accounts stay in this workspace.</p>
      <p>Can I still sign in? Yes. Sign-in, this page, company settings, and log out stay available.</p>
      <p>When does the trial start? After the workspace is created, for 14 days. Opening the signup page does not start it.</p>
      <p><Link to={marketingPaths.contact}>Contact FinTrack</Link></p>
      <button type="button" className="btn" onClick={logout}>Log out</button>
    </section>
  </main>;
}
