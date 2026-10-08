import { Link } from "react-router";
import { trialBannerCopy } from "./trial.js";

export function TrialBanner({ subscription, isOwner = false, actionTo = "/subscribe" }) {
  const copy = trialBannerCopy(subscription);
  if (!copy) return null;
  return <div className={`ft-trial-banner is-${copy.tone}`} role="status">
    <p><strong>{copy.title}</strong> {copy.detail}</p>
    {isOwner
      ? <Link to={actionTo}>{copy.action}</Link>
      : <span>Ask the business owner to choose a plan.</span>}
  </div>;
}
