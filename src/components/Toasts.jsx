import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, X } from "lucide-react";

const SUCCESS_MS = 4000;

// One floating message: a success closes itself after a few seconds; an error stays until dismissed.
function Toast({ tone, message, onClose }) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (tone === "error") return undefined;
    const timer = setTimeout(() => closeRef.current?.(), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [tone, message]);
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return <div className={`ft-toast is-${tone}`} role={tone === "error" ? "alert" : "status"}>
    <Icon className="ft-toast-icon" size={18} aria-hidden="true" />
    <span className="ft-toast-message">{message}</span>
    <button type="button" className="ft-toast-close" aria-label="Dismiss message" onClick={onClose}><X size={16} aria-hidden="true" /></button>
  </div>;
}

// Status messages ("Negative stock blocked.", "Could not save.") float at the bottom of the screen, so they are seen
// wherever the user is on the page. `items`: [{ id, tone: "success" | "error", message, onClose }]; empty messages are skipped.
export function Toasts({ items }) {
  const shown = items.filter(item => item.message);
  if (!shown.length || typeof document === "undefined") return null;
  return createPortal(<div className="ft-toasts" aria-live="polite">
    {shown.map(item => <Toast key={`${item.id}:${item.message}`} tone={item.tone || "success"} message={item.message} onClose={item.onClose} />)}
  </div>, document.body);
}
