import { useEffect, useState } from "react";
import { Button, Field, Modal } from "../../../components/ui.jsx";
import { createFinancePartner, listFinancePartners, updateFinancePartner } from "../../../lib/financeRepository.js";

export function FinancePartnersPanel({ token, visibleModules = [] }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ fullName: "", email: "" });
  const [created, setCreated] = useState(null);
  const moduleList = visibleModules.length
    ? visibleModules.join(", ")
    : "whatever modules this workspace has unlocked";

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setMembers(await listFinancePartners(token));
    } catch (err) {
      setError(err.message || "Could not load partners.");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return undefined;
    refresh();
    return undefined;
  }, [token]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await createFinancePartner(token, draft);
      setCreated(result);
      setDraft({ fullName: "", email: "" });
      await refresh();
    } catch (err) {
      setError(err.message || "Could not create the partner login.");
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (member, active) => {
    setBusy(true);
    setError("");
    try {
      await updateFinancePartner(token, { userId: member.userId, active });
      await refresh();
    } catch (err) {
      setError(err.message || "Could not update the partner.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card settings-section">
      <header className="settings-section-head">
        <div>
          <h2>View-only partners</h2>
          <p>
            Sleeping partners sign in with Owner sign-in. They can view every module unlocked in this workspace, and cannot record payments, post vouchers, or change settings.
          </p>
        </div>
      </header>
      {visibleModules.length ? (
        <ul className="partner-module-chips" aria-label="Modules this partner will see">
          {visibleModules.map(label => <li key={label}>{label}</li>)}
        </ul>
      ) : (
        <p className="small">Unlock at least one module for partners to have something to view.</p>
      )}
      <div className="form spacer">
        <Field label="Partner name"><input value={draft.fullName} onChange={event => setDraft(current => ({ ...current, fullName: event.target.value }))} placeholder="e.g. Ramesh Partner" /></Field>
        <Field label="Email"><input type="email" value={draft.email} onChange={event => setDraft(current => ({ ...current, email: event.target.value }))} placeholder="partner@example.com" /></Field>
        <div className="row"><Button className="primary" disabled={busy || !draft.fullName.trim() || !draft.email.trim()} onClick={submit}>{busy ? "Creating…" : "Add view-only partner"}</Button></div>
      </div>
      {error ? <p className="red small" role="alert">{error}</p> : null}
      {loading ? <p className="small">Loading partners…</p> : null}
      {!loading && !members.length ? <p className="small">No view-only partners yet.</p> : null}
      {members.length ? (
        <div className="table spacer">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Access</th><th></th></tr></thead>
            <tbody>
              {members.map(member => (
                <tr key={member.userId}>
                  <td>{member.fullName || "—"}</td>
                  <td>{member.email || "—"}</td>
                  <td>{member.active ? "View only · active" : "Disabled"}</td>
                  <td>
                    <Button disabled={busy} onClick={() => setActive(member, !member.active)}>
                      {member.active ? "Disable" : "Enable"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {created?.temporaryPassword ? (
        <Modal close={() => setCreated(null)}>
          <h2 className="title">Partner login created</h2>
          <p className="copy">Share these privately. {created.fullName || "Your partner"} uses Owner sign-in.</p>
          <p className="small"><strong>Email</strong><br />{created.email}</p>
          <p className="small"><strong>Temporary password</strong><br />{created.temporaryPassword}</p>
          <p className="notice">{created.message || `They can view ${moduleList} in view-only mode.`}</p>
          <div className="row spacer"><Button className="primary" onClick={() => setCreated(null)}>Done</Button></div>
        </Modal>
      ) : null}
    </section>
  );
}
