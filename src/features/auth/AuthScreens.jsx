import { useState } from "react";
import { ArrowRight, Briefcase, Building2, Coins, IdCard, KeyRound, LockKeyhole, Mail, Route, ShieldCheck, Ticket, UserRound } from "lucide-react";
import { Button, Field, IconInput, PasswordInput } from "../../components/ui.jsx";
import { AuthShowcase } from "./components/AuthShowcase.jsx";
import { chitCustomerPortalLogin, customerPortalLogin, loadWorkspace } from "../../lib/financeRepository";
import { isPublicSignupAllowed, signupInviteRequired, validateSignupInvite } from "../../lib/signupGate.js";
import { supabase } from "../../lib/supabase";
import { C } from "../../styles/theme.js";
import { sessionUserRole } from "../finance/model/workspaceAccess.js";
import { openLegalView } from "../legal/LegalPage.jsx";

// Who is signing in. `label` stays the button's accessible name.
const SIGN_IN_MODES = [
  { id: "signIn", label: "Financier sign in", title: "Financier", hint: "Owner workspace", icon: Briefcase },
  { id: "agent", label: "Agent login", title: "Collection agent", hint: "Route & collections", icon: Route },
  { id: "customer", label: "Customer login", title: "Customer", hint: "Loan balance", icon: UserRound },
  { id: "chitCustomer", label: "Chit customer", title: "Chit member", hint: "Schemes & bids", icon: Coins },
];

// FINTrack wordmark (Poppins, as in the Finebank logo) with an optional product suffix such as "Accounts".
function Wordmark({ suffix = "" }) {
  return <span className="ft-brand"><span className="ft-brand-strong">FIN</span>Track{suffix ? <span className="ft-wordmark-suffix"> {suffix}</span> : null}</span>;
}

export function PasswordRecovery() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("access_token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async event => {
    event.preventDefault();
    if (!token) { setMessage("This password-reset link is invalid or has expired. Request a new one from Financier sign in."); return; }
    if (password.length < 8) { setMessage("Use a password with at least 8 characters."); return; }
    if (password !== confirmPassword) { setMessage("The passwords do not match."); return; }
    setBusy(true); setMessage("");
    try {
      await supabase.auth.updatePassword(password, token);
      setMessage("Password updated successfully. You can now sign in.");
    } catch (error) { setMessage(error.message || "Unable to reset password. Request a new link and try again."); }
    finally { setBusy(false); }
  };
  const complete = message.includes("successfully");
  return <div className="login"><div className="brand ft-login-brand" style={{ textAlign: "center" }}><Wordmark /></div><h1 className="sub" style={{ textAlign: "center", marginBottom: 22, fontSize: 18, fontWeight: 600 }}>Set a new Financier password</h1><form className="card" onSubmit={save}><Field label="New password"><input disabled={complete} type="password" minLength="8" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field><div className="spacer"><Field label="Confirm new password"><input disabled={complete} type="password" minLength="8" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></Field></div>{message && <p className="small" style={{ color: complete ? C.green : C.red }}>{message}</p>}{complete ? <Button className="primary spacer" style={{ width: "100%" }} type="button" onClick={() => window.location.assign(window.location.pathname)}>Go to sign in</Button> : <Button className="primary spacer" style={{ width: "100%" }} disabled={busy} type="submit">{busy ? "Saving…" : "Save new password"}</Button>}</form></div>;
}
export function FinancierAuth({ onLogin, onCustomerLogin, onChitCustomerLogin }) {
  const [mode, setMode] = useState("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [portalId, setPortalId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const allowSignup = isPublicSignupAllowed();
  const accountsIntent = typeof sessionStorage !== "undefined" && sessionStorage.getItem("fintrack-login-context") === "accounts";
  const chooseMode = next => { setMode(next); setMessage(""); };
  const signInAndEnter = async () => {
    const result = await supabase.auth.signIn(email, password);
    const profile = await loadWorkspace(result.access_token);
    if (!profile.active) { await supabase.auth.signOut(); throw new Error("This account has been disabled. Contact your financier."); }
    if (mode === "agent" && profile.role !== "staff") throw new Error("This account is not a Collection Agent. Use Financier sign in.");
    if (mode === "signIn" && profile.role === "staff") throw new Error("Use Collection Agent sign in for this account.");
    onLogin({ role: sessionUserRole(profile.role), authToken: result.access_token, name: profile.fullName, workspace: profile });
  };
  const submit = async () => {
    setMessage(""); setBusy(true);
    try {
      if (mode === "customer") {
        if (!portalId || !password) throw new Error("Enter your portal ID and PIN.");
        onCustomerLogin(await customerPortalLogin(portalId, password));
      } else if (mode === "chitCustomer") {
        if (!portalId || !password) throw new Error("Enter your Chit portal ID and PIN.");
        onChitCustomerLogin(await chitCustomerPortalLogin(portalId, password));
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
    } catch (error) { setMessage(error.message || "Unable to sign in."); }
    finally { setBusy(false); }
  };
  const forgotPassword = async () => {
    if (!email) { setMessage("Enter your business email first, then select Forgot password."); return; }
    setBusy(true); setMessage("");
    try {
      await supabase.auth.resetPasswordForEmail(email);
      setMessage("Password reset email sent. Open the link in the email to set a new password.");
    } catch (error) { setMessage(error.message || "Unable to send the password reset email."); }
    finally { setBusy(false); }
  };
  const isFinanceCustomer = mode === "customer", isChitCustomer = mode === "chitCustomer", isCustomer = isFinanceCustomer || isChitCustomer, isAgent = mode === "agent";
  const brandName = !isCustomer && !isAgent && accountsIntent ? "FinTrack Accounts" : "FinTrack";
  const brandSub = isChitCustomer ? "View your chit schemes, payments, and live bids when they apply" : isFinanceCustomer ? "View your finance balance and payment history" : isAgent ? "Collection Agent workspace" : accountsIntent ? "Sign in to your small-business books. Daily Finance and Chit Fund stay optional." : "Secure workspace for finance businesses";
  const submitLabel = busy ? "Please wait…" : isChitCustomer ? "Open chit dashboard" : isFinanceCustomer ? "Open my dashboard" : mode === "signUp" ? "Create business account" : "Sign in";
  return <div className="ft-auth">
    <AuthShowcase />
    <main className="login ft-auth-panel">
      <div className="ft-auth-panel-inner">
        <div className="ft-auth-brandrow">
          <span className="ft-auth-mark ft-brand" aria-hidden="true">F</span>
          <Wordmark />
          {brandName !== "FinTrack" && <span className="ft-auth-product">{brandName.replace(/^FinTrack\s*/, "")}</span>}
        </div>
        <h1 className="ft-auth-title">{mode === "signUp" ? "Create your business account" : "Welcome back"}</h1>
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

        <form className="ft-auth-form" onSubmit={event => { event.preventDefault(); submit(); }}>
          {isCustomer ? <>
            <Field label={isChitCustomer ? "Chit portal ID" : "Customer portal ID"}><IconInput icon={IdCard} placeholder={isChitCustomer ? "e.g. CF-1A2B3C4D" : "e.g. FT-1A2B3C4D"} value={portalId} onChange={event => setPortalId(event.target.value.toUpperCase())} /></Field>
            <Field label="6-digit PIN"><PasswordInput icon={KeyRound} inputMode="numeric" minLength="6" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>
          </> : <>
            {mode === "signUp" && <>
              <Field label="Business name"><IconInput icon={Building2} placeholder="e.g. Vivek Finance" value={businessName} onChange={event => setBusinessName(event.target.value)} /></Field>
              <Field label="Your full name"><IconInput icon={UserRound} value={fullName} onChange={event => setFullName(event.target.value)} /></Field>
              {signupInviteRequired() && <Field label="Invite code"><IconInput icon={Ticket} value={inviteCode} onChange={event => setInviteCode(event.target.value)} /></Field>}
            </>}
            <Field label={isAgent ? "Agent email" : "Business email"}><IconInput icon={Mail} type="email" autoComplete="email" placeholder="you@business.com" value={email} onChange={event => setEmail(event.target.value)} /></Field>
            <div className="ft-auth-password">
              <Field label="Password"><PasswordInput icon={LockKeyhole} minLength="8" autoComplete={mode === "signIn" || isAgent ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} /></Field>
              {mode === "signIn" && <button type="button" className="link-button ft-auth-forgot" onClick={forgotPassword} disabled={busy}>Forgot password?</button>}
            </div>
          </>}
          {message && <p className="small ft-auth-message" role="status" style={{ color: message.includes("sent") || message.includes("created") ? C.green : C.red }}>{message}</p>}
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
