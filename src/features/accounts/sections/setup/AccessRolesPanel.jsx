import { useEffect, useState } from "react";
import {
  createAccountsTeamUser,
  listAccountsTeamUsers,
  updateAccountsTeamUser,
} from "../../data/accountingRepository.js";
import { Select } from "../../../../components/Select.jsx";
import { Field, AccSetupSection, AccTable } from "../../components/AccUi.jsx";

const emptyDraft = () => ({ fullName: "", email: "", role: "viewer" });

export function AccessRolesPanel({
  saving,
  run,
  token,
  setNotice,
  canAdmin = true,
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [members, setMembers] = useState([]);
  const [createdLogin, setCreatedLogin] = useState(null);
  const [loadError, setLoadError] = useState("");

  const refreshMembers = async () => {
    try {
      setLoadError("");
      setMembers(await listAccountsTeamUsers(token));
    } catch (err) {
      setMembers([]);
      setLoadError(err.message || "Could not load Accounts logins.");
    }
  };

  useEffect(() => {
    if (!token || !canAdmin) return undefined;
    let cancelled = false;
    listAccountsTeamUsers(token)
      .then(rows => { if (!cancelled) setMembers(rows); })
      .catch(err => {
        if (!cancelled) {
          setMembers([]);
          setLoadError(err.message || "Could not load Accounts logins.");
        }
      });
    return () => { cancelled = true; };
  }, [token, canAdmin]);

  if (!canAdmin) {
    return (
      <AccSetupSection icon="R" title="Accounts access" copy="Only the business owner can add a CA or Accounts login." collapsible summary="Owner only">
        <p className="small">Ask the owner to create your login from Setup.</p>
      </AccSetupSection>
    );
  }

  return (
    <AccSetupSection
      icon="R"
      title="Add CA / Accounts login"
      copy="Create a login inside this business for your CA or bookkeeper. They sign in as Financier with the email and temporary password you share. They only see Accounts — not Daily Finance, Chit, or Settings. Requires migration 109."
      collapsible
      summary={`${members.filter(row => row.active).length} logins`}
    >
      <div className="accounts-collab-guide">
        <div>
          <strong>Recommended</strong>
          <p className="small">Use <b>Viewer</b> for a CA who only reviews. Use <b>Accountant</b> if they should post and reconcile. You stay the only owner.</p>
        </div>
        <span className="acc-chip ok">Same business</span>
      </div>

      <h4 className="acc-subsection-title">New login</h4>
      <div className="form">
        <Field label="Full name"><input value={draft.fullName} onChange={event => setDraft(current => ({ ...current, fullName: event.target.value }))} placeholder="e.g. Ravi CA" /></Field>
        <Field label="Email"><input type="email" value={draft.email} onChange={event => setDraft(current => ({ ...current, email: event.target.value }))} placeholder="ca@example.com" /></Field>
        <Field label="Access">
          <Select value={draft.role} onChange={event => setDraft(current => ({ ...current, role: event.target.value }))}>
            <option value="viewer">Viewer (read only)</option>
            <option value="accountant">Accountant (can post)</option>
          </Select>
        </Field>
      </div>
      <div className="acc-form-actions">
        <button
          type="button"
          className="btn primary"
          disabled={saving || !draft.fullName.trim() || !draft.email.trim()}
          onClick={() => run(async () => {
            try {
              const result = await createAccountsTeamUser(token, draft);
              setDraft(emptyDraft());
              await refreshMembers();
              setCreatedLogin(result);
              return result;
            } catch (err) {
              // Clear the taken address so the owner can type another without selecting first.
              if (/already|different email|registered|belongs to another/i.test(err?.message || "")) {
                setDraft(current => ({ ...current, email: "" }));
              }
              throw err;
            }
          }, result => result?.message || "Accounts login ready. Share the details below.")}
        >
          {saving ? "Creating…" : "Create login"}
        </button>
      </div>

      {createdLogin && (
        <div className="notice accounts-invite-email" role="status">
          <strong>{createdLogin.status === "created" ? "Login created" : "Login updated"} · {createdLogin.fullName || createdLogin.email}</strong>
          <p className="small">Tell them to open FinTrack → sign in as <b>Financier</b> (not Agent / Customer / Chit member).</p>
          <div className="form">
            <Field label="Email"><input readOnly value={createdLogin.email || ""} /></Field>
            {createdLogin.temporaryPassword ? (
              <Field label="Temporary password"><input readOnly value={createdLogin.temporaryPassword} /></Field>
            ) : (
              <p className="small">No new password — they already had a login. Ask them to use Forgot password if needed.</p>
            )}
            <Field label="Access"><input readOnly value={createdLogin.role === "accountant" ? "Accountant (can post)" : "Viewer (read only)"} /></Field>
          </div>
          <div className="acc-form-actions">
            {createdLogin.temporaryPassword ? (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const text = `FinTrack Accounts access\n\nSign in as Financier (email + password).\nEmail: ${createdLogin.email}\nTemporary password: ${createdLogin.temporaryPassword}\nAccess: ${createdLogin.role}\n\nChange the password after first sign-in using Forgot password if you prefer.`;
                  try {
                    await navigator.clipboard.writeText(text);
                    setNotice("Login details copied. Paste them into WhatsApp or email for your CA.");
                  } catch {
                    setNotice("Copy failed. Select the email and password fields manually.");
                  }
                }}
              >
                Copy details
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => {
              const subject = encodeURIComponent("FinTrack Accounts access");
              const body = encodeURIComponent(
                createdLogin.temporaryPassword
                  ? `You have Accounts access on FinTrack.\n\n1. Open FinTrack and choose Financier sign-in.\n2. Email: ${createdLogin.email}\n3. Temporary password: ${createdLogin.temporaryPassword}\n4. Access: ${createdLogin.role}\n\nPlease change the password after you sign in (Forgot password).`
                  : `Your FinTrack Accounts access was updated (${createdLogin.role}).\n\nSign in as Financier with ${createdLogin.email}. Use Forgot password if you need a new password.`,
              );
              window.location.href = `mailto:${createdLogin.email}?subject=${subject}&body=${body}`;
            }}
            >
              Open email draft
            </button>
            <button type="button" className="btn" onClick={() => setCreatedLogin(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {loadError ? <p className="notice" role="alert">{loadError}</p> : null}

      <h4 className="acc-subsection-title">Existing logins</h4>
      <AccTable columns={["Name", "Email", "Access", ""]} empty={!members.length && "No CA or Accounts logins yet."}>
        {members.map(row => (
          <tr key={row.userId}>
            <td>{row.fullName || "—"}{row.active === false ? " · inactive" : ""}</td>
            <td>{row.email || "—"}</td>
            <td>{row.role === "accountant" ? "Accountant" : "Viewer"}</td>
            <td className="accounts-action-row">
              <Select
                value={row.role}
                disabled={saving || row.active === false}
                onChange={event => run(async () => {
                  await updateAccountsTeamUser(token, { userId: row.userId, role: event.target.value });
                  await refreshMembers();
                }, "Access updated.")}
              >
                <option value="viewer">Viewer</option>
                <option value="accountant">Accountant</option>
              </Select>
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => run(async () => {
                  await updateAccountsTeamUser(token, { userId: row.userId, active: row.active === false });
                  await refreshMembers();
                }, row.active === false ? "Login re-enabled." : "Login disabled.")}
              >
                {row.active === false ? "Enable" : "Disable"}
              </button>
            </td>
          </tr>
        ))}
      </AccTable>
    </AccSetupSection>
  );
}
