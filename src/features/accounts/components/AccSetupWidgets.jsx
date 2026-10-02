import { useEffect, useState } from "react";
import { INDUSTRY_TEMPLATES, readIndustry } from "./AccOnboardingWizard.jsx";
import { resolveEntitlements } from "../../commercial/entitlements.js";
import { SAAS_TIER_BLUEPRINT } from "../../commercial/featurePacks.js";
import { Field, AccSetupSection } from "./AccUi.jsx";

export function IndustryTemplateCard({ companyId }) {
  const [industry, setIndustry] = useState("retail");
  useEffect(() => {
    if (companyId) setIndustry(readIndustry(companyId));
  }, [companyId]);
  const template = INDUSTRY_TEMPLATES.find(item => item.id === industry) || INDUSTRY_TEMPLATES[0];
  return <div className="card accounts-industry-card">
    <div className="accounts-industry-head"><div><span className="small">Industry setup</span><h2>{template.label}</h2></div><span className="accounts-industry-badge">Template</span></div>
    <p className="copy">Recommended workflows for this company.</p>
    <div className="accounts-template-features">{template.features.map(feature => <span key={feature}>{feature}</span>)}</div>
  </div>;
}
export function SubscriptionMonitoringPanel({ orgSettings = {}, companyId }) {
  const entitlements = resolveEntitlements(orgSettings);
  const [monitorUrl, setMonitorUrl] = useState("");
  useEffect(() => { try { setMonitorUrl(localStorage.getItem(`fintrack-monitor-url:${companyId}`) || ""); } catch { setMonitorUrl(""); } }, [companyId]);
  const saveMonitorUrl = () => { try { localStorage.setItem(`fintrack-monitor-url:${companyId}`, monitorUrl.trim()); } catch { /* ignore */ } };
  const blueprint = SAAS_TIER_BLUEPRINT[entitlements.plan] || SAAS_TIER_BLUEPRINT.pro;
  return <>
    <AccSetupSection icon="$" title="Subscription & plan" copy="Your current entitlement is shown here. Billing checkout is not connected yet, so no charges are created from this screen." collapsible summary={entitlements.plan}>
      <div className="commercial-status-grid"><div className="card"><span className="small">Current plan</span><strong>{entitlements.plan}</strong><p className="small">{blueprint.note || "Configured workspace entitlement"}</p></div><div className="card"><span className="small">Feature packs</span><strong>{entitlements.packs.join(", ")}</strong><p className="small">{entitlements.modules.length} modules enabled</p></div><div className="card"><span className="small">Billing status</span><strong>Configuration only</strong><p className="small">Connect a payment provider before accepting paid subscriptions.</p></div></div>
    </AccSetupSection>
    <AccSetupSection icon="♥" title="External monitoring & alerts" copy="Configure an external uptime/alerting service to watch your deployed FinTrack URL. FinTrack does not claim a monitoring service is active until you configure one." collapsible summary="Optional">
      <div className="form"><Field className="span" label="External monitor URL"><input value={monitorUrl} placeholder="https://your-monitor.example/check" onChange={event => setMonitorUrl(event.target.value)} /></Field></div>
      <div className="acc-form-actions"><button type="button" className="btn primary" onClick={saveMonitorUrl}>Save monitoring reference</button><span className="small">Use this as a reference for your uptime provider; no credentials are stored.</span></div>
    </AccSetupSection>
  </>;
}
