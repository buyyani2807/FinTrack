import { useEffect, useMemo, useState } from "react";
import { INDIA_STATES } from "./accountingGst.js";

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "company", title: "Company" },
  { id: "gst", title: "GST" },
  { id: "party", title: "First party" },
  { id: "invite", title: "Invite CA" },
  { id: "done", title: "Done" },
];

const stepStorageKey = companyId => `fintrack-accounts-onboarding-step-v1:${companyId || "none"}`;

const readStoredStep = companyId => {
  if (!companyId || typeof sessionStorage === "undefined") return 0;
  try {
    const raw = Number(sessionStorage.getItem(stepStorageKey(companyId)));
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.min(raw, STEPS.length - 1);
  } catch {
    return 0;
  }
};

const writeStoredStep = (companyId, stepIndex) => {
  if (!companyId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(stepStorageKey(companyId), String(stepIndex));
  } catch {
    /* ignore quota */
  }
};

const clearStoredStep = companyId => {
  if (!companyId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(stepStorageKey(companyId));
  } catch {
    /* ignore */
  }
};

/**
 * First-run Accounts onboarding. Parent owns persistence via callbacks.
 */
export function AccOnboardingWizard({
  company,
  canAdmin = false,
  canWrite = false,
  saving = false,
  onSaveCompany,
  onSaveGst,
  onCreateParty,
  onInviteCa,
  onFinish,
  onSkip,
}) {
  const companyId = company?.id || "";
  const [stepIndex, setStepIndex] = useState(() => readStoredStep(companyId));
  const [companyName, setCompanyName] = useState(company?.name || "");
  const [booksStartedOn, setBooksStartedOn] = useState(company?.booksStartedOn || "2026-04-01");
  const [gstRegistration, setGstRegistration] = useState(company?.gstRegistration || "unregistered");
  const [gstin, setGstin] = useState(company?.gstin || "");
  const [legalName, setLegalName] = useState(company?.legalName || company?.name || "");
  const [stateCode, setStateCode] = useState(company?.stateCode || "");
  const [partyName, setPartyName] = useState("");
  const [partyType, setPartyType] = useState("customer");
  const [partyPhone, setPartyPhone] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    writeStoredStep(companyId, stepIndex);
  }, [companyId, stepIndex]);

  const step = STEPS[stepIndex] || STEPS[0];
  const progress = useMemo(() => `${stepIndex + 1} of ${STEPS.length}`, [stepIndex]);

  const goNext = () => {
    setLocalError("");
    setStepIndex(index => Math.min(index + 1, STEPS.length - 1));
  };

  const finishWizard = () => {
    clearStoredStep(companyId);
    if (onFinish) onFinish();
  };

  const skipWizard = () => {
    clearStoredStep(companyId);
    if (onSkip) onSkip();
  };

  const runStep = async () => {
    setLocalError("");
    try {
      if (step.id === "company") {
        if (!String(companyName || "").trim()) throw new Error("Business name is required.");
        if (onSaveCompany) await onSaveCompany({ companyName: companyName.trim(), booksStartedOn });
      }
      if (step.id === "gst" && canAdmin && onSaveGst) {
        await onSaveGst({
          gstRegistration,
          gstin: gstRegistration === "unregistered" ? "" : gstin,
          legalName: legalName || companyName,
          stateCode: gstRegistration === "unregistered" ? "" : stateCode,
        });
      }
      if (step.id === "party" && canWrite && partyName.trim() && onCreateParty) {
        await onCreateParty({
          partyType,
          name: partyName.trim(),
          phone: partyPhone.trim(),
        });
      }
      if (step.id === "invite" && canAdmin && inviteEmail.trim() && onInviteCa) {
        await onInviteCa({ email: inviteEmail.trim(), role: inviteRole });
      }
      if (step.id === "done") {
        finishWizard();
        return;
      }
      goNext();
    } catch (error) {
      setLocalError(error?.message || "Could not save this step.");
    }
  };

  return (
    <div className="card accounts-form-card acc-onboarding">
      <div className="acc-onboarding-head">
        <div>
          <strong>Set up Accounts</strong>
          <p className="small">Step {progress}: {step.title}</p>
        </div>
        {onSkip ? <button type="button" className="btn" disabled={saving} onClick={skipWizard}>Skip for now</button> : null}
      </div>

      {step.id === "welcome" && (
        <div className="spacer">
          <p className="copy">Six steps: welcome → company → GST → optional party → optional CA invite → done. Use Continue on each screen; optional steps have Skip.</p>
          <p className="small">Daily Finance, Monthly Finance, and Chit Fund stay separate. This only configures trade books for this company.</p>
        </div>
      )}

      {step.id === "company" && (
        <div className="form spacer">
          <label className="accounts-filter-field"><span className="small">Business name</span>
            <input value={companyName} onChange={event => setCompanyName(event.target.value)} />
          </label>
          <label className="accounts-filter-field"><span className="small">Books start date</span>
            <input type="date" value={booksStartedOn} onChange={event => setBooksStartedOn(event.target.value)} />
          </label>
        </div>
      )}

      {step.id === "gst" && (
        <div className="form spacer">
          {!canAdmin && <p className="copy">Only the owner can change GST. Continue to the next step.</p>}
          <label className="accounts-filter-field"><span className="small">Registration</span>
            <select value={gstRegistration} disabled={!canAdmin} onChange={event => setGstRegistration(event.target.value)}>
              <option value="unregistered">Unregistered</option>
              <option value="regular">Regular</option>
              <option value="composition">Composition</option>
            </select>
          </label>
          {gstRegistration !== "unregistered" && <>
            <label className="accounts-filter-field"><span className="small">GSTIN</span>
              <input value={gstin} disabled={!canAdmin} placeholder="15-character GSTIN" onChange={event => setGstin(event.target.value.toUpperCase())} />
            </label>
            <label className="accounts-filter-field"><span className="small">Legal name</span>
              <input value={legalName} disabled={!canAdmin} onChange={event => setLegalName(event.target.value)} />
            </label>
            <label className="accounts-filter-field"><span className="small">State</span>
              <select value={stateCode} disabled={!canAdmin} onChange={event => setStateCode(event.target.value)}>
                <option value="">Select state</option>
                {INDIA_STATES.map(state => <option key={state.code} value={state.code}>{state.code} · {state.name}</option>)}
              </select>
            </label>
          </>}
        </div>
      )}

      {step.id === "party" && (
        <div className="form spacer">
          <p className="copy">Optional — add your first customer or supplier. You can skip.</p>
          <label className="accounts-filter-field"><span className="small">Type</span>
            <select value={partyType} disabled={!canWrite} onChange={event => setPartyType(event.target.value)}>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
            </select>
          </label>
          <label className="accounts-filter-field"><span className="small">Name</span>
            <input value={partyName} disabled={!canWrite} placeholder="e.g. ABC Traders" onChange={event => setPartyName(event.target.value)} />
          </label>
          <label className="accounts-filter-field"><span className="small">Phone (for WhatsApp)</span>
            <input value={partyPhone} disabled={!canWrite} placeholder="10-digit mobile" onChange={event => setPartyPhone(event.target.value)} />
          </label>
        </div>
      )}

      {step.id === "invite" && (
        <div className="form spacer">
          <p className="copy">Invite your CA as <strong>viewer</strong> (recommended) so they can review books without your password.</p>
          {!canAdmin && <p className="small">Only the owner can invite. Continue.</p>}
          <label className="accounts-filter-field"><span className="small">CA email</span>
            <input type="email" value={inviteEmail} disabled={!canAdmin} placeholder="ca@example.com" onChange={event => setInviteEmail(event.target.value)} />
          </label>
          <label className="accounts-filter-field"><span className="small">Role</span>
            <select value={inviteRole} disabled={!canAdmin} onChange={event => setInviteRole(event.target.value)}>
              <option value="viewer">Viewer (read only)</option>
              <option value="accountant">Accountant (can post)</option>
            </select>
          </label>
        </div>
      )}

      {step.id === "done" && (
        <div className="spacer">
          <p className="copy">Accounts is ready. Post a sale, import a bank statement, or open Setup anytime.</p>
          <ul className="copy">
            <li>Share invoices and party statements on WhatsApp when the party has a phone.</li>
            <li>Match bank lines from Banking — suggestions appear automatically.</li>
            <li>Invite more teammates later from Setup → Accounts access roles.</li>
          </ul>
        </div>
      )}

      {localError ? <p className="notice acc-toast error" role="alert">{localError}</p> : null}

      <div className="accounts-action-row spacer">
        {stepIndex > 0 && step.id !== "done" ? (
          <button type="button" className="btn" disabled={saving} onClick={() => { setLocalError(""); setStepIndex(index => Math.max(0, index - 1)); }}>Back</button>
        ) : null}
        {(step.id === "party" || step.id === "invite") && (
          <button type="button" className="btn" disabled={saving} onClick={goNext}>Skip</button>
        )}
        <button type="button" className="btn primary" disabled={saving} onClick={runStep}>
          {saving ? "Saving…" : step.id === "done" ? "Go to Overview" : step.id === "welcome" ? "Start" : "Continue"}
        </button>
      </div>
    </div>
  );
}

export function accountsOnboardingStorageKey(companyId) {
  return `fintrack-accounts-onboarding-v1:${companyId || "none"}`;
}

export function isAccountsOnboardingDone(companyId) {
  if (!companyId || typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(accountsOnboardingStorageKey(companyId)) === "done";
  } catch {
    return true;
  }
}

export function markAccountsOnboardingDone(companyId) {
  if (!companyId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(accountsOnboardingStorageKey(companyId), "done");
    clearStoredStep(companyId);
  } catch {
    /* ignore quota */
  }
}
