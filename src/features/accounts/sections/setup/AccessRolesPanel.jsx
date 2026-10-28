import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  createAccountsTeamUser,
  listAccountsTeamUsers,
  updateAccountsTeamUser,
} from "../../data/accountingRepository.js";
import { Select } from "../../../../components/Select.jsx";
import { Field, AccSetupSection, AccTable } from "../../components/AccUi.jsx";

const emptyDraft = (activeCompanyId = "") => ({
  fullName: "",
  email: "",
  role: "viewer",
  companyIds: activeCompanyId ? [activeCompanyId] : [],
});

function companySummary(companies, selectedIds) {
  if (!selectedIds.length) return "Choose companies…";
  const names = companies.filter(company => selectedIds.includes(company.id)).map(company => company.name);
  if (!names.length) return "Choose companies…";
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(", ");
  return `${names[0]} +${names.length - 1} more`;
}

/** Compact multi-select: trigger looks like a select; menu lists companies with checkboxes. */
function CompanyMultiSelect({ companies, selectedIds, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = event => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!companies.length) {
    return <p className="small">No active Accounts companies to assign.</p>;
  }

  const toggle = companyId => {
    const checked = selectedIds.includes(companyId);
    if (checked && selectedIds.length === 1) return;
    onChange(checked ? selectedIds.filter(id => id !== companyId) : [...selectedIds, companyId]);
  };

  return (
    <div className={`accounts-company-multi${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`ft-select accounts-company-multi-trigger${!selectedIds.length ? " is-placeholder" : ""}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen(current => !current)}
      >
        <span className="ft-select-value">{companySummary(companies, selectedIds)}</span>
        <ChevronDown className="ft-select-chevron" size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="accounts-company-multi-menu" id={listId} role="listbox" aria-multiselectable="true" aria-label="Companies this login can open">
          {companies.map(company => {
            const checked = selectedIds.includes(company.id);
            return (
              <label key={company.id} className={`accounts-company-multi-option${checked ? " is-selected" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || (checked && selectedIds.length === 1)}
                  onChange={() => toggle(company.id)}
                />
                <span>{company.name}{company.isPrimary ? " · primary" : ""}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AccessRolesPanel({
  saving,
  run,
  token,
  setNotice,
  canAdmin = true,
  companies = [],
  activeCompanyId = "",
}) {
  const activeCompanies = companies.filter(company => company.status !== "archived");
  const [draft, setDraft] = useState(() => emptyDraft(activeCompanyId));
  const [members, setMembers] = useState([]);
  const [createdLogin, setCreatedLogin] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [editingCompaniesFor, setEditingCompaniesFor] = useState(null);
  const [editCompanyIds, setEditCompanyIds] = useState([]);

  useEffect(() => {
    setDraft(current => {
      if (current.fullName || current.email) return current;
      if (current.companyIds.length) return current;
      if (!activeCompanyId) return current;
      return { ...current, companyIds: [activeCompanyId] };
    });
  }, [activeCompanyId]);

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
      copy="Create a login for your CA or bookkeeper. They use Owner sign-in with the email and temporary password you share. They only see Accounts, and only the companies you choose. Requires migrations 109 and 111."
      collapsible
      summary={`${members.filter(row => row.active).length} logins`}
    >
      <div className="accounts-collab-guide">
        <div>
          <strong>Recommended</strong>
          <p className="small">Default is only the company you have open now — not every company, and not the primary unless that is the open one. Use <b>Viewer</b> so they cannot use New (sale, purchase, …). Use <b>Accountant</b> only if they should post.</p>
        </div>
        <span className="acc-chip ok">Per company</span>
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
        <Field label="Companies">
          <CompanyMultiSelect
            companies={activeCompanies}
            selectedIds={draft.companyIds}
            onChange={companyIds => setDraft(current => ({ ...current, companyIds }))}
            disabled={saving}
          />
        </Field>
      </div>
      <div className="acc-form-actions">
        <button
          type="button"
          className="btn primary"
          disabled={saving || !draft.fullName.trim() || !draft.email.trim() || !draft.companyIds.length}
          onClick={() => run(async () => {
            try {
              const result = await createAccountsTeamUser(token, draft);
              setDraft(emptyDraft(activeCompanyId));
              await refreshMembers();
              setCreatedLogin(result);
              return result;
            } catch (err) {
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
          <p className="small">Tell them to open FinTrack → sign in as <b>Owner</b> (not Agent / Customer / Chit member). They only open the companies you assigned.</p>
          <div className="form">
            <Field label="Email"><input readOnly value={createdLogin.email || ""} /></Field>
            {createdLogin.temporaryPassword ? (
              <Field label="Temporary password"><input readOnly value={createdLogin.temporaryPassword} /></Field>
            ) : (
              <p className="small">No new password — they already had a login. Ask them to use Forgot password if needed.</p>
            )}
            <Field label="Access"><input readOnly value={createdLogin.role === "accountant" ? "Accountant (can post)" : "Viewer (read only)"} /></Field>
            <Field label="Companies"><input readOnly value={(createdLogin.companyNames || []).join(", ") || "—"} /></Field>
          </div>
          <div className="acc-form-actions">
            {createdLogin.temporaryPassword ? (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const companiesLine = (createdLogin.companyNames || []).length
                    ? `\nCompanies: ${createdLogin.companyNames.join(", ")}`
                    : "";
                  const text = `FinTrack Accounts access\n\nSign in as Owner (email + password).\nEmail: ${createdLogin.email}\nTemporary password: ${createdLogin.temporaryPassword}\nAccess: ${createdLogin.role}${companiesLine}\n\nChange the password after first sign-in using Forgot password if you prefer.`;
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
              const companiesLine = (createdLogin.companyNames || []).length
                ? `\nCompanies: ${createdLogin.companyNames.join(", ")}`
                : "";
              const subject = encodeURIComponent("FinTrack Accounts access");
              const body = encodeURIComponent(
                createdLogin.temporaryPassword
                  ? `You have Accounts access on FinTrack.\n\n1. Open FinTrack and choose Owner sign-in.\n2. Email: ${createdLogin.email}\n3. Temporary password: ${createdLogin.temporaryPassword}\n4. Access: ${createdLogin.role}${companiesLine}\n\nPlease change the password after you sign in (Forgot password).`
                  : `Your FinTrack Accounts access was updated (${createdLogin.role}).\n\nSign in as Owner with ${createdLogin.email}. Use Forgot password if you need a new password.`,
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
      <AccTable columns={["Name", "Email", "Access", "Companies", ""]} empty={!members.length && "No CA or Accounts logins yet."}>
        {members.map(row => (
          <tr key={row.userId}>
            <td>{row.fullName || "—"}{row.active === false ? " · inactive" : ""}</td>
            <td>{row.email || "—"}</td>
            <td>{row.role === "accountant" ? "Accountant" : "Viewer"}</td>
            <td>
              {(row.companyNames || []).length
                ? row.companyNames.join(", ")
                : <span className="small">None assigned — they cannot open any company until you assign one.</span>}
            </td>
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
                disabled={saving || row.active === false}
                onClick={() => {
                  setEditingCompaniesFor(row.userId);
                  setEditCompanyIds(row.companyIds?.length ? [...row.companyIds] : (activeCompanyId ? [activeCompanyId] : []));
                }}
              >
                Companies
              </button>
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

      {editingCompaniesFor ? (
        <div className="notice accounts-invite-email" role="dialog" aria-label="Edit company access">
          <strong>Companies for this login</strong>
          <p className="small">They will only see the companies you choose.</p>
          <CompanyMultiSelect
            companies={activeCompanies}
            selectedIds={editCompanyIds}
            onChange={setEditCompanyIds}
            disabled={saving}
          />
          <div className="acc-form-actions">
            <button
              type="button"
              className="btn primary"
              disabled={saving || !editCompanyIds.length}
              onClick={() => run(async () => {
                await updateAccountsTeamUser(token, { userId: editingCompaniesFor, companyIds: editCompanyIds });
                setEditingCompaniesFor(null);
                await refreshMembers();
              }, "Company access updated.")}
            >
              {saving ? "Saving…" : "Save companies"}
            </button>
            <button type="button" className="btn" disabled={saving} onClick={() => setEditingCompaniesFor(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
    </AccSetupSection>
  );
}
