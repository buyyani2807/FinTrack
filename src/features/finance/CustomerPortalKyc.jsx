import { useState } from "react";
import { Button, Field, Metric, Modal } from "../../components/ui.jsx";

export function CustomerPortalSetup({ loan, close, save }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdPortalId, setCreatedPortalId] = useState("");
  const submit = async () => {
    if (!/^\d{6,}$/.test(pin)) return setError("Use a PIN with at least 6 digits.");
    if (pin !== confirm) return setError("The two PINs do not match.");
    setBusy(true); setError("");
    try {
      const portalId = await save(loan, pin);
      if (portalId) { setCreatedPortalId(portalId); setPin(""); setConfirm(""); }
      else close();
    }
    catch (err) { setError(err.message || "Could not save the customer portal PIN."); }
    finally { setBusy(false); }
  };
  const portalId = createdPortalId || loan.portalId;
  return <Modal><h2 className="title">Customer portal</h2>{portalId ? <><p className="copy">Portal ID: <strong className="gold">{portalId}</strong></p><p className="notice">Give this portal ID and the PIN to {loan.customerName} privately. They can use Customer login from the FinTrack sign-in page.</p>{createdPortalId ? <div className="row spacer"><span className="small">Portal enabled successfully.</span><Button className="primary" onClick={close}>Done</Button></div> : <><div className="tool-stack spacer"><Field label="New customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm customer PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Reset PIN"}</Button></div></>}</> : <><p className="copy">Enable private dashboard access for {loan.customerName}.</p><p className="notice">Choose a unique PIN and share it privately with the customer. FinTrack will create a portal ID for this account.</p><div className="tool-stack spacer"><Field label="New customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm customer PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Enable customer portal"}</Button></div></>}</Modal>;
}
export function NewAccountPortalNotice({ customerName, portalId, pin, whatsAppNotice = "", close }) {
  return <Modal><h2 className="title">Customer portal enabled</h2><p className="copy">{customerName} can sign in from the FinTrack login page using Customer login.</p><div className="grid metrics spacer"><Metric label="Portal ID" value={portalId} color="gold" /><Metric label="PIN" value={pin} color="blue" /></div><p className="notice">Share the portal ID and PIN with the customer privately. You can reset the PIN anytime from the customer account page.</p>{whatsAppNotice && <p className="notice">{whatsAppNotice}</p>}<div className="row spacer"><Button className="primary" onClick={close}>Done</Button></div></Modal>;
}
export function KycDetails({ loan, kyc, edit }) {
  return <div className="card spacer"><div className="toolbar"><div><strong>KYC details</strong><p className="small">Visible only to your financier workspace.</p></div><Button onClick={() => edit(loan)}>Edit KYC</Button></div><div className="grid metrics"><Metric label="Aadhaar number" value={kyc?.aadhaar || "Not added"} color={kyc?.aadhaar ? "gold" : ""} /><Metric label="PAN number" value={kyc?.pan || "Not added"} color={kyc?.pan ? "gold" : ""} /></div></div>;
}
export function KycEditor({ loan, current, close, save }) {
  const [aadhaar, setAadhaar] = useState(current?.aadhaar || "");
  const [pan, setPan] = useState(current?.pan || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError("");
    try { await save(loan, aadhaar, pan); close(); }
    catch (err) { setError(err.message || "Could not save KYC details."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">KYC details</h2><p className="notice">These details are encrypted in the database and are never shown to customers.</p><div className="form spacer"><Field label="Aadhaar number"><input inputMode="numeric" maxLength="12" value={aadhaar} onChange={event => setAadhaar(event.target.value.replace(/\D/g, ""))} /></Field><Field label="PAN number"><input maxLength="10" value={pan} onChange={event => setPan(event.target.value.toUpperCase())} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save KYC"}</Button></div></Modal>;
}
