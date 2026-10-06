import { useEffect, useState } from "react";
import { Select } from "../../components/Select.jsx";
import { BackButton, Badge, Button, EmptyState, Field, Modal, Spinner } from "../../components/ui.jsx";
import { formatInr as money } from "../../lib/formatMoney.js";
import { agentCollectsAccounts, financeKindLabel, mapAgentRouteCustomers, staffAssignableLoans } from "./model/collectionStaff";
import { loanBalance, loanStatus } from "./model/loanState.js";

const byCustomerName = (a, b) => String(a.customerName || "").localeCompare(String(b.customerName || ""), undefined, { sensitivity: "base" });
export function ResetStaffPasswordModal({ staff, close, save }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true); setError("");
    try { await save(password); close(); }
    catch (err) { setError(err?.message || "Could not reset password."); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Reset staff password</h2><p className="copy">Set a new password for {staff.full_name}. Share it with them privately.</p><Field className="spacer" label="New password"><input type="password" minLength="8" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy || password.length < 8} onClick={submit}>{busy ? "Saving…" : "Reset password"}</Button></div></Modal>;
}
// A full page: the staff list, or one staff member with their customer assignments (opened from the list).
// The open staff member is the URL (/collection-staff/:staffId, see app/AppRoutes.jsx).
const worksForChoice = agent => (
  agent?.collection_scope === "accounts" && agent.accounts_company_id
    ? `accounts:${agent.accounts_company_id}`
    : agent?.collection_scope === "finance" ? "finance" : ""
);
const worksForLabel = (agent, companies = []) => {
  if (agent?.collection_scope === "finance") return "Finance and chit";
  if (agent?.collection_scope === "accounts") return companies.find(company => company.id === agent.accounts_company_id)?.name || "Accounts company";
  return "Not set";
};
const companyLinkFromChoice = choice => {
  if (choice === "finance") return { collectionScope: "finance", accountsCompanyId: null };
  if (String(choice || "").startsWith("accounts:")) return { collectionScope: "accounts", accountsCompanyId: choice.slice("accounts:".length) };
  return null;
};

function WorksForField({ value, onChange, companies }) {
  const choices = companies.filter(company => company.status !== "archived" || value === `accounts:${company.id}`);
  return <Field label="Collects for"><Select value={value} onChange={event => onChange(event.target.value)}><option value="">Select</option><option value="finance">Finance and chit customers</option>{choices.map(company => <option key={company.id} value={`accounts:${company.id}`}>{company.name}</option>)}</Select></Field>;
}

export function CollectionStaffPage({ loans, loadAgents, createAgent, assignAgent, updateAgent, staffId = null, onSelect, companies = [], loadRouteCustomers, onOpenRoutes }) {
  const [agents, setAgents] = useState([]), [search, setSearch] = useState(""), [showCreate, setShowCreate] = useState(false), [showEdit, setShowEdit] = useState(false), [showResetPassword, setShowResetPassword] = useState(false), [error, setError] = useState(""), [draftIds, setDraftIds] = useState([]), [saved, setSaved] = useState(""), [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true); setError("");
    try {
      const list = await loadAgents();
      const enriched = await Promise.all((list || []).map(async agent => {
        if (!agentCollectsAccounts(agent) || !loadRouteCustomers) return agent;
        try {
          const result = await loadRouteCustomers(agent);
          const fromBooks = mapAgentRouteCustomers(result?.routes, result?.stops, result?.parties, result?.agentId || agent.id);
          if (fromBooks.length) return { ...agent, route_customers: fromBooks };
        } catch (err) {
          setError(err?.message || "Could not load route customers.");
        }
        return agent;
      }));
      setAgents(enriched);
    } catch (e) { setError(e.message || "Could not load staff."); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  const selected = staffId ? agents.find(agent => agent.id === staffId) || null : null;
  const accountsAgent = agentCollectsAccounts(selected);
  const shownRouteCustomers = Array.isArray(selected?.route_customers) ? selected.route_customers : [];
  const resetDraft = agent => { setDraftIds(loans.filter(loan => loan.collectionAgentId === agent.id).map(loan => loan.id)); setSearch(""); setSaved(""); };
  // Opening a staff member (from the list or a URL) starts their assignment draft from what is saved.
  const [draftFor, setDraftFor] = useState(null);
  if (selected && draftFor !== selected.id) { setDraftFor(selected.id); resetDraft(selected); }
  const assigned = loan => draftIds.includes(loan.id);
  const visibleLoans = staffAssignableLoans(loans, { selectedAgentId: selected?.id, search, statusOf: loanStatus }).sort(byCustomerName);
  const choose = agent => onSelect?.(agent.id);
  const toggle = id => setDraftIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  const saveStaff = async details => { try { const updated = await updateAgent({ id: selected.id, ...details }); setAgents(current => current.map(agent => agent.id === updated.id ? { ...agent, ...updated, route_customers: updated.route_customers || agent.route_customers } : agent)); setShowEdit(false); setSaved("Staff details saved successfully."); } catch (e) { setError(e.message || "Could not save staff details."); } };
  const saveAssignments = async () => {
    if (accountsAgent) return;
    try {
      const changes = loans.map(loan => {
        const next = draftIds.includes(loan.id) ? selected.id : loan.collectionAgentId === selected.id ? "" : loan.collectionAgentId;
        if (next === loan.collectionAgentId) return null;
        return { account_id: loan.id, agent_id: next || null };
      }).filter(Boolean);
      await assignAgent(changes);
      setAgents(current => current.map(agent => agent.id === selected.id ? { ...agent, assigned_customer_count: draftIds.length } : agent));
      setSaved("Customer assignments saved successfully.");
    } catch (e) { setError(e.message || "Could not save assignments."); }
  };
  return <main className="shell collection-staff-page">
    {selected
      ? <>
        <BackButton onClick={() => onSelect?.(null)} />
        <div className="toolbar"><div><h1 className="title">{selected.full_name}</h1><p className="copy">{[[selected.email, selected.phone].filter(Boolean).join(" · "), worksForLabel(selected, companies)].filter(Boolean).join(" · ") || "No contact details"}</p></div><div className="tabs"><Button onClick={() => setShowEdit(true)}>Edit staff</Button><Button onClick={() => setShowResetPassword(true)}>Reset password</Button></div></div>
        {error && <p className="red small">{error}</p>}
        {accountsAgent ? <div className="card">
          <div className="toolbar"><div><strong>Route customers</strong><p className="small">{worksForLabel(selected, companies)} customers on this agent's collection routes. Add or remove them under Accounts, with {worksForLabel(selected, companies)} selected, in Parties → Routes.</p></div>{onOpenRoutes && <Button onClick={() => onOpenRoutes(selected.accounts_company_id)}>Open routes</Button>}</div>
          {saved && <p className="green small">{saved}</p>}
          <div className="customer-search"><input aria-label="Search route customers" placeholder="Search customers" value={search} onChange={e => setSearch(e.target.value)} /></div>
          {loading ? <Spinner label="Loading route customers" /> : <div className="table"><table><thead><tr><th>Customer</th><th>Route</th><th>Phone</th></tr></thead><tbody>{shownRouteCustomers.filter(customer => `${customer.name} ${customer.phone} ${customer.routeName}`.toLowerCase().includes(search.trim().toLowerCase())).map(customer => <tr key={`${customer.routeId}:${customer.partyId}`}><td>{customer.name}</td><td>{customer.routeName}{customer.routeActive ? "" : " · Paused"}</td><td>{customer.phone || "—"}</td></tr>)}</tbody></table></div>}
          {!loading && !shownRouteCustomers.length && <p className="copy spacer">No customers on a route for this agent yet. Open routes for {worksForLabel(selected, companies)} and assign {selected.full_name}.</p>}
        </div> : <div className="card">
          <div className="toolbar"><div><strong>Assigned customers</strong><p className="small">Finance and chit customers only. Select customers, then save. {draftIds.length} customers selected.</p></div></div>
          {saved && <p className="green small">{saved}</p>}
          <div className="customer-search"><input aria-label="Search customers" placeholder="Search customers" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="table"><table><thead><tr><th>Customer</th><th>Finance</th><th>Outstanding</th><th>Assigned</th></tr></thead><tbody>{visibleLoans.map(loan => <tr key={loan.id}><td>{loan.customerName}<br /><span className="small">{loan.phone}</span></td><td>{financeKindLabel(loan.kind)}</td><td>{money(loanBalance(loan))}</td><td><input type="checkbox" aria-label={`Assign ${loan.customerName}`} checked={assigned(loan)} onChange={() => toggle(loan.id)} /></td></tr>)}</tbody></table></div>
          <div className="row spacer collection-staff-actions"><Button onClick={() => resetDraft(selected)}>Cancel</Button><Button className="primary" onClick={saveAssignments}>Save Changes</Button></div>
        </div>}
      </>
      : <>
        <div className="toolbar"><div><h1 className="title">Collection Staff</h1><p className="copy">Accounts agents collect that company's route customers. Finance and chit agents collect the customers you assign here.</p></div><div className="tabs"><Button className="primary" onClick={() => setShowCreate(true)}>+ Create New Agent</Button></div></div>
        {error && <p className="red small">{error}</p>}
        <div className="card">{loading ? <Spinner label="Loading collection staff" /> : !agents.length ? <EmptyState title="No collection staff yet" copy="Add staff to give them their own sign-in. They see only the customers you assign and record only their own collections." action={<Button className="primary" onClick={() => setShowCreate(true)}>+ Create New Agent</Button>} /> : <div className="table"><table><thead><tr><th>Agent</th><th>Email</th><th>Mobile</th><th>Collects for</th><th>Status</th><th>Assigned customers</th><th></th></tr></thead><tbody>{agents.map(agent => <tr key={agent.id}><td>{agent.full_name}</td><td>{agent.email || "—"}</td><td>{agent.phone || "—"}</td><td>{worksForLabel(agent, companies)}</td><td><Badge status={agent.is_active ? "active" : "closed"} /></td><td>{agentCollectsAccounts(agent) ? (agent.route_customers?.length || 0) : (agent.assigned_customer_count || 0)}</td><td><Button onClick={() => choose(agent)}>{agentCollectsAccounts(agent) ? "View" : "View / Assign"}</Button></td></tr>)}</tbody></table></div>}</div>
      </>}
    {showEdit && <EditCollectionStaff staff={selected} companies={companies} close={() => setShowEdit(false)} save={saveStaff} />}{showResetPassword && selected && <ResetStaffPasswordModal staff={selected} close={() => setShowResetPassword(false)} save={async password => { await updateAgent({ id: selected.id, name: selected.full_name, email: selected.email, phone: selected.phone, active: selected.is_active, password }); setSaved("Password reset successfully."); }} />}{showCreate && <CreateAgent companies={companies} close={() => { setShowCreate(false); refresh(); }} save={async details => { await createAgent(details); }} />}
  </main>;
}
export function EditCollectionStaff({ staff, companies = [], close, save }) {
  const [name, setName] = useState(staff.full_name || ""), [email, setEmail] = useState(staff.email || ""), [phone, setPhone] = useState(staff.phone || ""), [active, setActive] = useState(staff.is_active !== false), [worksFor, setWorksFor] = useState(worksForChoice(staff)), [busy, setBusy] = useState(false);
  const submit = async () => {
    const link = companyLinkFromChoice(worksFor);
    if (!name.trim() || !email.trim() || !link) return;
    setBusy(true);
    try { await save({ name, email, phone, active, ...link }); } finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Edit collection staff</h2><p className="copy">Update contact details or which company this agent collects for. An Accounts company removes finance customer assignments. Finance and chit removes this agent from Accounts routes. Password changes use the separate Reset password action.</p><div className="form spacer"><Field label="Staff name"><input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Email address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field><Field label="Mobile number"><input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field><WorksForField value={worksFor} onChange={setWorksFor} companies={companies} /><Field label="Status"><Select value={active ? "active" : "inactive"} onChange={e => setActive(e.target.value === "active")}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field></div><div className="row spacer"><Button className="primary" disabled={busy || !name.trim() || !email.trim() || !worksFor} onClick={submit}>{busy ? "Saving…" : "Save Changes"}</Button></div></Modal>;
}
export function CreateAgent({ close, save, companies = [] }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [password, setPassword] = useState(""), [worksFor, setWorksFor] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const submit = async () => {
    const link = companyLinkFromChoice(worksFor);
    if (!link) { setError("Choose whether this agent collects for an Accounts company or for finance and chit customers."); return; }
    setBusy(true); setError("");
    try { await save({ name, email, phone, password, active: true, ...link }); close(); } catch (e) { setError(e.message || "Could not create agent."); } finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Add collection staff</h2><p className="copy">Staff sign in under the company you choose. Accounts agents collect that company's route customers. Finance and chit agents collect the customers you assign here.</p><div className="form spacer"><Field label="Staff name"><input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Email address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field><Field label="Mobile number"><input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field><Field label="Password"><input type="password" minLength="8" value={password} onChange={e => setPassword(e.target.value)} /></Field><WorksForField value={worksFor} onChange={setWorksFor} companies={companies} /></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button className="primary" disabled={busy || !worksFor} onClick={submit}>{busy ? "Creating…" : "Create staff"}</Button></div></Modal>;
}
