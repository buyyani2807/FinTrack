import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertCircle, ArrowRight, Briefcase, Building2, CheckCircle2, Coins, IdCard, Info, KeyRound, LockKeyhole, Mail, Route, ShieldCheck, Ticket, UserRound } from "lucide-react";
import { Button, Field, IconInput, PasswordInput } from "../../components/ui.jsx";
import { AuthShowcase } from "./components/AuthShowcase.jsx";
import { chitCustomerPortalLogin, customerPortalLogin, loadWorkspace } from "../../lib/financeRepository";
import { isPublicSignupAllowed, signupInviteRequired, validateSignupInvite } from "../../lib/signupGate.js";
import { supabase } from "../../lib/supabase";
import { sessionUserRole } from "../finance/model/workspaceAccess.js";
import { openLegalView } from "../legal/LegalPage.jsx";

// Who is signing in. `label` stays the button's accessible name.
const SIGN_IN_MODES = [
  { id: "signIn", label: "Financier sign in", title: "Financier", hint: "Owner workspace", icon: Briefcase },
  { id: "agent", label: "Agent login", title: "Collection agent", hint: "Route & collections", icon: Route },
  { id: "customer", label: "Customer login", title: "Customer", hint: "Loan balance", icon: UserRound },
  { id: "chitCustomer", label: "Chit customer", title: "Chit member", hint: "Schemes & bids", icon: Coins },
];

// One line of guidance under the sign-in options: where this person's credentials come from (none for Financier).
const MODE_GUIDE = {
  agent: "Your financier shares your agent ID (it starts with AG-) and a 6-digit PIN when they add you under Collection Staff.",
  customer: "Your financier shares your portal ID (it starts with FT-) and a 6-digit PIN when they open your customer portal.",
  chitCustomer: "Your chit manager shares your portal ID (it starts with CF-) and a 6-digit PIN when you join a scheme.",
  signUp: "The 14 days start when the workspace is created. Opening this page does not start the trial. After 14 days you can still sign in, your records stay, and recording waits until you choose a plan.",
};

// Plain-language versions of common sign-in errors; anything else is shown as it comes.
const friendlyError = text => {
  const message = String(text || "");
  if (/invalid agent id or pin/i.test(message)) return "The agent ID or PIN is incorrect.";
  if (/invalid login credentials|invalid (email|password)|wrong password/i.test(message)) return "The email or password is incorrect. Check both and try again, or use Forgot password.";
  if (/email not confirmed/i.test(message)) return "This email address has not been confirmed yet. Open the confirmation email, then sign in.";
  if (/user already registered|already exists/i.test(message)) return "An account with this email already exists. Sign in instead, or use Forgot password.";
  if (/failed to fetch|network|load failed/i.test(message)) return "FinTrack could not be reached. Check your internet connection and try again.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a minute, then try again.";
  return message;
};

const NOTICE_ICONS = { error: AlertCircle, success: CheckCircle2, info: Info };

// Error, success or info message on the auth screens: an icon, a short title and the explanation.
// Errors are announced straight away (role="alert"); the others politely.
function AuthNotice({ notice }) {
  if (!notice) return null;
  const Icon = NOTICE_ICONS[notice.tone] || Info;
  return <div className={`ft-auth-notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
    <Icon className="ft-auth-notice-icon" size={20} aria-hidden="true" />
    <div>{notice.title && <strong>{notice.title}</strong>}<p>{notice.text}</p></div>
  </div>;
}

// FINTrack wordmark (Poppins, as in the Finebank logo) with an optional product suffix such as "Accounts".
function Wordmark({ suffix = "" }) {
  return <span className="ft-brand"><span className="ft-brand-strong">FIN</span>Track{suffix ? <span className="ft-wordmark-suffix"> {suffix}</span> : null}</span>;
}

export function PasswordRecovery() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("access_token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState(null);
  const [invalid, setInvalid] = useState({});
  const [busy, setBusy] = useState(false);
  const fail = (title, text, fields = {}) => { setNotice({ tone: "error", title, text }); setInvalid(fields); };
  const save = async event => {
    event.preventDefault();
    if (!token) { fail("This link has expired", "This password-reset link is invalid or has expired. Request a new one from Financier sign in."); return; }
    if (password.length < 8) { fail("Password too short", "Use a password with at least 8 characters.", { password: true }); return; }
    if (password !== confirmPassword) { fail("Passwords don't match", "The passwords do not match.", { confirm: true }); return; }
    setBusy(true); setNotice(null); setInvalid({});
    try {
      await supabase.auth.updatePassword(password, token);
      setNotice({ tone: "success", title: "Password updated", text: "Password updated successfully. You can now sign in." });
    } catch (error) { fail("Couldn't update your password", friendlyError(error.message) || "Unable to reset password. Request a new link and try again."); }
    finally { setBusy(false); }
  };
  const complete = notice?.tone === "success";
  return <div className="ft-auth ft-auth-single">
    <main className="login ft-auth-panel">
      <div className="ft-auth-panel-inner">
        <div className="ft-auth-brandrow"><Wordmark /></div>
        <h1 className="ft-auth-title">Set a new Financier password</h1>
        <p className="sub ft-auth-sub">Use at least 8 characters.</p>
        <form className="ft-auth-form" onSubmit={save} noValidate>
          <Field label="New password"><PasswordInput icon={LockKeyhole} disabled={complete} minLength="8" autoComplete="new-password" placeholder="e.g. Secure@2026" aria-invalid={invalid.password || undefined} value={password} onChange={event => { setPassword(event.target.value); setInvalid(current => ({ ...current, password: false })); }} /></Field>
          <Field label="Confirm new password"><PasswordInput icon={LockKeyhole} disabled={complete} minLength="8" autoComplete="new-password" aria-invalid={invalid.confirm || undefined} value={confirmPassword} onChange={event => { setConfirmPassword(event.target.value); setInvalid(current => ({ ...current, confirm: false })); }} /></Field>
          <AuthNotice notice={notice} />
          {complete
            ? <Button className="primary ft-auth-submit" type="button" onClick={() => window.location.assign(window.location.pathname)}>Go to sign in<ArrowRight size={18} aria-hidden="true" /></Button>
            : <Button className="primary ft-auth-submit" disabled={busy} type="submit">{busy ? "Saving…" : "Save new password"}</Button>}
        </form>
      </div>
    </main>
  </div>;
}
export function FinancierAuth({ onLogin, onCustomerLogin, onChitCustomerLogin }) {
  const [params] = useSearchParams();
  const allowSignup = isPublicSignupAllowed();
  const [mode, setMode] = useState(() => (params.get("signup") === "1" && allowSignup ? "signUp" : "signIn"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [portalId, setPortalId] = useState("");
  const [notice, setNotice] = useState(null);
  // Fields to outline in red after a submit that left them empty.
  const [invalid, setInvalid] = useState({});
  const formRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const accountsIntent = typeof sessionStorage !== "undefined" && sessionStorage.getItem("fintrack-login-context") === "accounts";
  const chooseMode = next => { setMode(next); setNotice(null); setInvalid({}); };
  const clearInvalid = field => setInvalid(current => (current[field] ? { ...current, [field]: false } : current));
  // Empty required fields: outline them, focus the first and explain.
  const flagMissing = (fields, text, title = "A few details are missing") => {
    setInvalid(Object.fromEntries(fields.map(field => [field, true])));
    setNotice({ tone: "error", title, text });
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  };
  const signInAndEnter = async () => {
    const result = await supabase.auth.signIn(email, password);
    const profile = await loadWorkspace(result.access_token);
    if (!profile.active) { await supabase.auth.signOut(); throw new Error("This account has been disabled. Contact your financier."); }
    if (mode === "agent" && profile.role !== "staff") { await supabase.auth.signOut(); throw new Error("This account is not a Collection Agent. Use Financier sign in."); }
    if (mode === "signIn" && profile.role === "staff") { await supabase.auth.signOut(); throw new Error("Use Collection Agent sign in for this account."); }
    onLogin({ role: sessionUserRole(profile.role), authToken: result.access_token, name: profile.fullName, workspace: profile });
  };
  const submit = async () => {
    const empty = { portalId: !portalId, password: !password, email: !String(email || "").trim(), businessName: !businessName, fullName: !fullName };
    const missing = fields => fields.filter(field => empty[field]);
    if (mode === "agent" && missing(["portalId", "password"]).length) { flagMissing(missing(["portalId", "password"]), "Enter your agent ID and PIN."); return; }
    if ((mode === "customer" || mode === "chitCustomer") && missing(["portalId", "password"]).length) { flagMissing(missing(["portalId", "password"]), mode === "chitCustomer" ? "Enter your Chit portal ID and PIN." : "Enter your portal ID and PIN."); return; }
    if (mode === "signUp" && allowSignup && missing(["businessName", "fullName"]).length) { flagMissing(missing(["businessName", "fullName"]), "Enter your business name and your name."); return; }
    if (mode === "signIn" && missing(["email", "password"]).length) { flagMissing(missing(["email", "password"]), "Enter your business email and password."); return; }
    // The same rules the browser's own checks applied (email format, 8-character password, 6-digit PIN).
    const usesEmail = mode === "signIn" || (mode === "signUp" && allowSignup);
    if (usesEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) { flagMissing(["email"], "Enter a valid email address, like you@business.com.", "Check your email address"); return; }
    if (usesEmail && password.length < 8) { flagMissing(["password"], "Passwords have at least 8 characters.", "Check your password"); return; }
    if ((mode === "customer" || mode === "chitCustomer" || mode === "agent") && password.length < 6) { flagMissing(["password"], "Your PIN has 6 digits.", "Check your PIN"); return; }
    setNotice(null); setInvalid({}); setBusy(true);
    try {
      if (mode === "customer") {
        if (!portalId || !password) throw new Error("Enter your portal ID and PIN.");
        onCustomerLogin(await customerPortalLogin(portalId, password));
      } else if (mode === "chitCustomer") {
        if (!portalId || !password) throw new Error("Enter your Chit portal ID and PIN.");
        onChitCustomerLogin(await chitCustomerPortalLogin(portalId, password));
      } else if (mode === "agent") {
        if (!portalId || !password) throw new Error("Enter your agent ID and PIN.");
        const session = await supabase.auth.signInAgent(portalId, password);
        const profile = await loadWorkspace(session.access_token);
        if (!profile.active) { await supabase.auth.signOut(); throw new Error("This account has been disabled. Contact your financier."); }
        if (profile.role !== "staff") { await supabase.auth.signOut(); throw new Error("This account is not a Collection Agent. Use Financier sign in."); }
        onLogin({ role: sessionUserRole(profile.role), authToken: session.access_token, name: profile.fullName, workspace: profile });
      } else if (mode === "signUp") {
        if (!allowSignup) throw new Error("New business signup is invite-only. Contact FinTrack support for access.");
        if (!businessName || !fullName) throw new Error("Enter your business name and your name.");
        if (!validateSignupInvite(inviteCode)) throw new Error("Enter a valid invite code.");
        const result = await supabase.auth.signUp(email, password, { businessName, fullName, inviteCode });
        if (!result.access_token) {
          throw new Error("Your account could not be signed in automatically. In Supabase, turn off Confirm email under Authentication → Providers → Email, then try again.");
        }
        // API signup already runs provision_financier and deletes the Auth user on failure.
        // Direct (local) signup still needs client-side provisioning.
        if (!result.provisioned) {
          await supabase.rpc("provision_financier", {
            workspace_name: businessName,
            display_name: fullName,
            invite_code: inviteCode || null,
          }, result.access_token);
        }
        let profile;
        try {
          profile = await loadWorkspace(result.access_token);
        } catch {
          profile = { role: "owner", businessName, fullName, organizationSettings: {}, active: true, id: "" };
        }
        onLogin({ role: "financier", authToken: result.access_token, name: fullName, workspace: profile });
      } else {
        if (!String(email || "").trim() || !password) throw new Error("Enter your business email and password.");
        await signInAndEnter();
      }
    } catch (error) {
      const title = mode === "signUp" ? "Couldn't create your account" : mode === "customer" || mode === "chitCustomer" ? "Couldn't open your dashboard" : "Couldn't sign you in";
      setNotice({ tone: "error", title, text: friendlyError(error.message) || "Unable to sign in." });
    }
    finally { setBusy(false); }
  };
  const forgotPassword = async () => {
    if (!email) {
      setInvalid({ email: true });
      setNotice({ tone: "info", title: "Enter your email first", text: "Enter your business email first, then select Forgot password." });
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true); setNotice(null); setInvalid({});
    try {
      await supabase.auth.resetPasswordForEmail(email);
      setNotice({ tone: "success", title: "Check your inbox", text: `Password reset email sent to ${email}. Open the link in the email to set a new password.` });
    } catch (error) { setNotice({ tone: "error", title: "Couldn't send the reset email", text: friendlyError(error.message) || "Unable to send the password reset email." }); }
    finally { setBusy(false); }
  };
  const isFinanceCustomer = mode === "customer", isChitCustomer = mode === "chitCustomer", isCustomer = isFinanceCustomer || isChitCustomer, isAgent = mode === "agent", isPortalLogin = isCustomer || isAgent;
  const brandName = !isCustomer && !isAgent && accountsIntent ? "FinTrack Accounts" : "FinTrack";
  const brandSub = mode === "signUp"
    ? "No payment required to start. Daily Finance, Monthly Finance, Chit Fund, and Accounts are included."
    : isChitCustomer ? "View your chit schemes, payments, and live bids when they apply" : isFinanceCustomer ? "View your finance balance and payment history" : isAgent ? "Collection Agent workspace" : accountsIntent ? "Sign in to your small-business books. Daily Finance and Chit Fund stay optional." : "Secure workspace for finance businesses";
  const submitLabel = busy ? "Please wait…" : isChitCustomer ? "Open chit dashboard" : isFinanceCustomer ? "Open my dashboard" : mode === "signUp" ? "Start free trial" : "Sign in";
  return <div className="ft-auth">
    <AuthShowcase />
    <main className="login ft-auth-panel">
      <div className="ft-auth-panel-inner">
        <div className="ft-auth-brandrow">
          <Wordmark />
          {brandName !== "FinTrack" && <span className="ft-auth-product">{brandName.replace(/^FinTrack\s*/, "")}</span>}
        </div>
        <p className="small"><Link to="/">Back to the FinTrack website</Link></p>
        <h1 className={`ft-auth-title${mode === "signUp" ? " is-one-line" : ""}`}>{mode === "signUp" ? "Start your 14-day free trial" : "Welcome back"}</h1>
        <p className="sub ft-auth-sub">{brandSub}</p>

        {mode !== "signUp" && <div className="ft-auth-modes" role="group" aria-label="Sign in as">
          {SIGN_IN_MODES.map(option => <button
            key={option.id}
            type="button"
            className={`ft-auth-mode${mode === option.id ? " active" : ""}`}
            aria-pressed={mode === option.id}
            aria-label={option.label}
            onClick={() => chooseMode(option.id)}
          >
            <span className="ft-auth-mode-icon" aria-hidden="true"><option.icon size={20} /></span>
            <span className="ft-auth-mode-text"><strong>{option.title}</strong><span>{option.hint}</span></span>
          </button>)}
        </div>}

        {MODE_GUIDE[mode] && <p className="ft-auth-guide"><Info size={16} aria-hidden="true" />{MODE_GUIDE[mode]}</p>}

        <form ref={formRef} className="ft-auth-form" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
          {isPortalLogin ? <>
            <Field label={isAgent ? "Agent ID" : isChitCustomer ? "Chit portal ID" : "Customer portal ID"}><IconInput icon={IdCard} placeholder={isAgent ? "e.g. AG-1A2B3C4D" : isChitCustomer ? "e.g. CF-1A2B3C4D" : "e.g. FT-1A2B3C4D"} aria-invalid={invalid.portalId || undefined} value={portalId} onChange={event => { setPortalId(event.target.value.toUpperCase()); clearInvalid("portalId"); }} /></Field>
            <Field label="6-digit PIN"><PasswordInput icon={KeyRound} inputMode="numeric" minLength="6" autoComplete="current-password" placeholder="6 digits" aria-invalid={invalid.password || undefined} value={password} onChange={event => { setPassword(event.target.value); clearInvalid("password"); }} /></Field>
          </> : <>
            {mode === "signUp" && <>
              <Field label="Business name"><IconInput icon={Building2} placeholder="e.g. Sri Lakshmi Finance" aria-invalid={invalid.businessName || undefined} value={businessName} onChange={event => { setBusinessName(event.target.value); clearInvalid("businessName"); }} /></Field>
              <Field label="Your full name"><IconInput icon={UserRound} placeholder="e.g. Ravi Teja" aria-invalid={invalid.fullName || undefined} value={fullName} onChange={event => { setFullName(event.target.value); clearInvalid("fullName"); }} /></Field>
              {signupInviteRequired() && <Field label="Invite code"><IconInput icon={Ticket} value={inviteCode} onChange={event => setInviteCode(event.target.value)} /></Field>}
            </>}
            <Field label="Business email"><IconInput icon={Mail} type="email" autoComplete="email" placeholder="you@business.com" aria-invalid={invalid.email || undefined} value={email} onChange={event => { setEmail(event.target.value); clearInvalid("email"); }} /></Field>
            <div className="ft-auth-password">
              <Field label="Password"><PasswordInput icon={LockKeyhole} minLength="8" placeholder="e.g. Secure@2026" autoComplete={mode === "signIn" || isAgent ? "current-password" : "new-password"} aria-invalid={invalid.password || undefined} value={password} onChange={event => { setPassword(event.target.value); clearInvalid("password"); }} /></Field>
              {mode === "signIn" && <button type="button" className="link-button ft-auth-forgot" onClick={forgotPassword} disabled={busy}>Forgot password?</button>}
            </div>
          </>}
          {mode === "signUp" && <p className="ft-field-hint">Password: at least 8 characters.</p>}
          <AuthNotice notice={notice} />
          <Button className="primary ft-auth-submit" disabled={busy} type="submit">{submitLabel}{!busy && <ArrowRight size={18} aria-hidden="true" />}</Button>
        </form>

        {allowSignup && <p className="ft-auth-switch">
          {mode === "signUp"
            ? <>Already have an account? <button type="button" className="link-button" onClick={() => chooseMode("signIn")}>Sign in</button></>
            : <>New to FinTrack? <button type="button" className="link-button" onClick={() => chooseMode("signUp")}>Create business account</button></>}
        </p>}
        <p className="ft-auth-legal small"><ShieldCheck size={14} aria-hidden="true" /> Encrypted sign-in · <button type="button" className="link-button" onClick={() => openLegalView("privacy")}>Privacy</button> · <button type="button" className="link-button" onClick={() => openLegalView("terms")}>Terms</button></p>
      </div>
    </main>
  </div>;
}
