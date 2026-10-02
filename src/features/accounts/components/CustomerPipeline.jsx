import { Select } from "../../../components/Select.jsx";
const CRM_STAGES = ["Lead", "Contacted", "Quoted", "Won", "Lost"];
export function CustomerPipeline({ companyId, parties = [], pipeline = {}, onStageChange, saving = false }) {
  const stages = pipeline;
  const customers = parties.filter(party => party.partyType === "customer" && party.isActive !== false);
  const setStage = (id, stage) => onStageChange?.(id, stage);
  return <div className="acc-panel acc-crm-panel">
    <div className="accounts-panel-head"><div><h1 className="accounts-panel-title">Customer pipeline</h1><p className="copy">Track customer conversations from first contact to won or lost. Pipeline stages never change accounting balances.</p></div><span className="accounts-industry-badge">CRM</span></div>
    <div className="crm-pipeline-grid">{CRM_STAGES.map(stage => {
      const rows = customers.filter(customer => (stages[customer.id] || "Lead") === stage);
      return <section className="card crm-stage" key={stage}><div className="crm-stage-head"><strong>{stage}</strong><span>{rows.length}</span></div>{rows.map(customer => <article className="crm-customer-card" key={customer.id}><strong>{customer.name}</strong><span className="small">{customer.phone || customer.email || "No contact details"}</span><Select disabled={saving} value={stage} onChange={event => setStage(customer.id, event.target.value)} aria-label={`Stage for ${customer.name}`}>{CRM_STAGES.map(option => <option key={option}>{option}</option>)}</Select></article>)}{!rows.length && <p className="small">No customers here.</p>}</section>;
    })}</div>
  </div>;
}
