import { loadAccountsRoles, setAccountsUserRole, inviteTeamMember, listTeamInvites, revokeTeamInvite } from "../../data/accountingRepository.js";
import { Select } from "../../../../components/Select.jsx";
import { Field, AccSetupSection, AccTable } from "../../components/AccUi.jsx";

export function AccessRolesPanel({
  accountsRoles,
  teamInvites,
  inviteDraft,
  setInviteDraft,
  saving,
  run,
  token,
  setTeamInvites,
  setAccountsRoles,
  setInviteEmailDraft,
  setNotice,
  inviteEmailDraft,
  roleDraft,
  setRoleDraft,
}) {
  return (
    <AccSetupSection
      icon="R"
      title="Accounts access roles"
      copy="Invite your CA by email (viewer recommended), or paste a user UUID. Requires migrations 070–076."
      collapsible
      summary={`${accountsRoles.length} assigned · ${teamInvites.filter(row => row.status === "pending").length} pending`}
    >
      <div className="accounts-collab-guide">
        <div><strong>Recommended collaboration setup</strong><p className="small">Give your accountant <b>Accountant</b> access to post and reconcile. Give an external reviewer <b>Viewer</b> access. The owner remains the only user who can manage roles, lock periods, or change company settings.</p></div>
        <span className="acc-chip ok">Owner controlled</span>
      </div>
      <h4 className="acc-subsection-title">Invite by email</h4>
      <div className="form">
        <Field label="Email"><input type="email" value={inviteDraft.email} onChange={event => setInviteDraft(current => ({ ...current, email: event.target.value }))} placeholder="ca@example.com" /></Field>
        <Field label="Role">
          <Select value={inviteDraft.role} onChange={event => setInviteDraft(current => ({ ...current, role: event.target.value }))}>
            <option value="viewer">Viewer (read only)</option>
            <option value="accountant">Accountant (can post)</option>
          </Select>
        </Field>
        <Field label="Note (optional)"><input value={inviteDraft.note} onChange={event => setInviteDraft(current => ({ ...current, note: event.target.value }))} placeholder="e.g. FY 2026-27 review" /></Field>
      </div>
      <div className="acc-form-actions">
        <button type="button" className="btn primary" disabled={saving || !inviteDraft.email.trim()} onClick={() => run(async () => {
          const result = await inviteTeamMember(token, inviteDraft);
          setInviteDraft({ email: "", role: "viewer", note: "" });
          setTeamInvites(await listTeamInvites(token));
          setAccountsRoles(await loadAccountsRoles(token));
          if (result?.status === "pending") setInviteEmailDraft({ email: result.email, role: result.role, expiresAt: result.expiresAt });
          if (result?.status === "assigned") {
            setNotice(`Assigned ${result.role} to ${result.email}.`);
          }
        }, inviteDraft.email ? `Invite processed for ${inviteDraft.email.trim()}.` : "Invite saved.")}>{saving ? "Saving…" : "Send invite"}</button>
      </div>
      {inviteEmailDraft && <div className="notice accounts-invite-email" role="status"><strong>Invite recorded for {inviteEmailDraft.email}</strong><p className="small">The current backend does not send email automatically. Use your email client to send the instructions below; after the user signs up with this email, the invite is claimed automatically.</p><button type="button" className="btn" onClick={() => { const subject = encodeURIComponent(`FinTrack Accounts access · ${inviteEmailDraft.role}`); const body = encodeURIComponent(`You have been invited to FinTrack Accounts as ${inviteEmailDraft.role}. Sign up or sign in using this email address. Your Accounts access will be activated automatically after sign-in.`); window.location.href = `mailto:${inviteEmailDraft.email}?subject=${subject}&body=${body}`; }}>Open email draft</button><button type="button" className="btn" onClick={() => setInviteEmailDraft(null)}>Dismiss</button></div>}
      <AccTable columns={["Email", "Role", "Status", ""]} empty={!teamInvites.length && "No email invites yet."}>
        {teamInvites.map(row => (
          <tr key={row.id}>
            <td>{row.email}</td>
            <td>{row.role}</td>
            <td>{row.status}</td>
            <td>{row.status === "pending" ? <button type="button" className="btn" disabled={saving} onClick={() => run(async () => {
              await revokeTeamInvite(token, row.id);
              setTeamInvites(await listTeamInvites(token));
            }, "Invite revoked.")}>Revoke</button> : null}</td>
          </tr>
        ))}
      </AccTable>
      <h4 className="acc-subsection-title">Assign by user ID</h4>
      <div className="form">
        <Field label="User ID (auth UUID)"><input value={roleDraft.userId} onChange={event => setRoleDraft(current => ({ ...current, userId: event.target.value.trim() }))} placeholder="Paste Supabase auth user UUID" /></Field>
        <Field label="Role">
          <Select value={roleDraft.role} onChange={event => setRoleDraft(current => ({ ...current, role: event.target.value }))}>
            <option value="accountant">Accountant (read + write)</option>
            <option value="viewer">Viewer (read only)</option>
          </Select>
        </Field>
      </div>
      <div className="acc-form-actions">
        <button type="button" className="btn primary" disabled={saving || !roleDraft.userId} onClick={() => run(async () => {
          await setAccountsUserRole(token, roleDraft.userId, roleDraft.role);
          setRoleDraft({ userId: "", role: "accountant" });
          setAccountsRoles(await loadAccountsRoles(token));
        }, "Accounts role saved.")}>{saving ? "Saving…" : "Assign role"}</button>
      </div>
      <AccTable columns={["User ID", "Role", ""]} empty={!accountsRoles.length && "No accountant or viewer roles assigned yet. Owner keeps full access."}>
        {accountsRoles.map(row => (
          <tr key={row.id}>
            <td className="small">{row.userId}</td>
            <td>{row.role}</td>
            <td><button type="button" className="btn" disabled={saving} onClick={() => run(async () => {
              await setAccountsUserRole(token, row.userId, null);
              setAccountsRoles(await loadAccountsRoles(token));
            }, "Accounts role cleared.")}>Remove</button></td>
          </tr>
        ))}
      </AccTable>
    </AccSetupSection>
  );
}
