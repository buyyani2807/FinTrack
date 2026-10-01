import { useEffect, useState } from "react";
import { Badge, Button, Field, Modal } from "../../components/ui.jsx";
import { formatInr as money } from "../../lib/formatMoney.js";
import { financeKindLabel, staffAssignableLoans } from "./model/collectionStaff";
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
  return <Modal close={close}><h2 className="title">Reset staff password</h2><p className="copy">Set a new password for {staff.full_name}. Share it with them privately.</p><Field className="spacer" label="New password"><input type="password" minLength="8" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close} disabled={busy}>Cancel</Button><Button className="primary" disabled={busy || password.length < 8} onClick={submit}>{busy ? "Saving…" : "Reset password"}</Button></div></Modal>;
}
export function CollectionStaffPage({ loans, close, loadAgents, createAgent, assignAgent, updateAgent }) {
  const [agents, setAgents] = useState([]), [selected, setSelected] = useState(null), [search, setSearch] = useState(""), [showCreate, setShowCreate] = useState(false), [showEdit, setShowEdit] = useState(false), [showResetPassword, setShowResetPassword] = useState(false), [error, setError] = useState(""), [draftIds, setDraftIds] = useState([]), [saved, setSaved] = useState(""), [loading, setLoading] = useState(true);
  const refresh = async () => { setLoading(true); setError(""); try { setAgents(await loadAgents()); } catch (e) { setError(e.message || "Could not load staff."); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, []);
  const assigned = loan => draftIds.includes(loan.id);
  const visibleLoans = staffAssignableLoans(loans, { selectedAgentId: selected?.id, search, statusOf: loanStatus }).sort(byCustomerName);
  const choose = agent => { setSelected(agent); setDraftIds(loans.filter(loan => loan.collectionAgentId === agent.id).map(loan => loan.id)); setSearch(""); setSaved(""); };
  const toggle = id => setDraftIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  const saveStaff = async details => { try { const updated = await updateAgent({ id: selected.id, ...details }); setSelected(updated); setAgents(current => current.map(agent => agent.id === updated.id ? updated : agent)); setShowEdit(false); setSaved("Staff details saved successfully."); } catch (e) { setError(e.message || "Could not save staff details."); } };
  const saveAssignments = async () => {
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
  return <Modal><div className="row"><Button onClick={selected ? () => setSelected(null) : close}>← Back</Button><h2 className="title">Collection Staff</h2></div>{error && <p className="red small">{error}</p>}{!selected ? <><div className="row spacer"><span className="copy">Create staff, review existing staff, and assign customer accounts.</span><Button className="primary" onClick={() => setShowCreate(true)}>+ Create New Agent</Button></div>{loading ? <p className="small spacer">Loading collection staff…</p> : <div className="table spacer"><table><thead><tr><th>Agent</th><th>Email</th><th>Mobile</th><th>Status</th><th>Assigned customers</th><th></th></tr></thead><tbody>{agents.map(agent => <tr key={agent.id}><td>{agent.full_name}</td><td>{agent.email || "—"}</td><td>{agent.phone || "—"}</td><td><Badge status={agent.is_active ? "active" : "closed"} /></td><td>{agent.assigned_customer_count || 0}</td><td><Button onClick={() => choose(agent)}>View / Assign</Button></td></tr>)}</tbody></table></div>}</> : <div className="card spacer"><div className="row"><h3>{selected.full_name}</h3><Button onClick={() => setShowEdit(true)}>Edit staff</Button><Button onClick={() => setShowResetPassword(true)}>Reset password</Button></div><p className="small">Email and mobile number can be changed using Edit staff. Select customers, then save. {draftIds.length} customers selected.</p>{saved && <p className="green small">{saved}</p>}<div className="customer-search"><input placeholder="Search customers" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="table"><table><thead><tr><th>Customer</th><th>Finance</th><th>Outstanding</th><th>Assigned</th></tr></thead><tbody>{visibleLoans.map(loan => <tr key={loan.id}><td>{loan.customerName}<br /><span className="small">{loan.phone}</span></td><td>{financeKindLabel(loan.kind)}</td><td>{money(loanBalance(loan))}</td><td><input type="checkbox" checked={assigned(loan)} onChange={() => toggle(loan.id)} /></td></tr>)}</tbody></table></div><div className="row spacer"><Button onClick={() => choose(selected)}>Cancel</Button><Button className="primary" onClick={saveAssignments}>Save Changes</Button></div></div>}{showEdit && <EditCollectionStaff staff={selected} close={() => setShowEdit(false)} save={saveStaff} />}{showResetPassword && selected && <ResetStaffPasswordModal staff={selected} close={() => setShowResetPassword(false)} save={async password => { await updateAgent({ id: selected.id, name: selected.full_name, email: selected.email, phone: selected.phone, active: selected.is_active, password }); setSaved("Password reset successfully."); }} />}{showCreate && <CreateAgent close={() => { setShowCreate(false); refresh(); }} save={async details => { await createAgent(details); }} />}</Modal>;
}
export function EditCollectionStaff({ staff, close, save }) {
  const [name, setName] = useState(staff.full_name || ""), [email, setEmail] = useState(staff.email || ""), [phone, setPhone] = useState(staff.phone || ""), [active, setActive] = useState(staff.is_active !== false), [busy, setBusy] = useState(false);
  const submit = async () => { if (!name.trim() || !email.trim()) return; setBusy(true); try { await save({ name, email, phone, active }); } finally { setBusy(false); } };
  return <Modal close={close}><h2 className="title">Edit collection staff</h2><p className="copy">Update contact details or account status. Password changes use the separate Reset password action.</p><div className="form spacer"><Field label="Staff name"><input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Email address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field><Field label="Mobile number"><input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field><Field label="Status"><select value={active ? "active" : "inactive"} onChange={e => setActive(e.target.value === "active")}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field></div><div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy || !name.trim() || !email.trim()} onClick={submit}>{busy ? "Saving…" : "Save Changes"}</Button></div></Modal>;
}
export function CreateAgent({ close, save }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); setError(""); try { await save({ name, email, phone, password, active: true }); close(); } catch (e) { setError(e.message || "Could not create agent."); } finally { setBusy(false); } };
  return <Modal><h2 className="title">Add collection staff</h2><p className="copy">Staff get only assigned accounts and can record their own collections.</p><div className="form spacer"><Field label="Staff name"><input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Email address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field><Field label="Mobile number"><input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field><Field label="Password"><input type="password" minLength="8" value={password} onChange={e => setPassword(e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create staff"}</Button></div></Modal>;
}
