// Shared presentational building blocks used across the finance app.
export const Button = ({
  children,
  className = "",
  ...props
}) => <button className={`btn ${className}`} {...props}>{children}</button>;
export const Field = ({
  label,
  children,
  className = ""
}) => <div className={`field ${className}`}><label>{label}</label>{children}</div>;
export const Metric = ({
  label,
  value,
  color = "",
  onClick
}) => {
  const inner = <><div className="metric-label">{label}</div><div className={`metric-value ${color}`}>{value}</div></>;
  return onClick
    ? <button type="button" className="card metric-link" onClick={onClick}>{inner}</button>
    : <div className="card">{inner}</div>;
};
// Form field whose <label> wraps the control; `required` adds a marker after the label text.
export const LabeledField = ({ label, children, required, className }) => (
  <label className={`field${className ? ` ${className}` : ""}`}>
    <span>{label}{required ? <span className="acc-req"> *</span> : null}</span>
    {children}
  </label>
);
// `tone` picks the badge colour class when it differs from the label.
export const Badge = ({
  status,
  tone = status
}) => <span className={`badge ${tone}`}>{status}</span>;
// `isolateClicks` stops clicks inside the dialog reaching clickable parents (e.g. cards).
export const Modal = ({
  children,
  isolateClicks = false
}) => {
  const stop = isolateClicks ? event => event.stopPropagation() : undefined;
  return <div className="modal-bg" onClick={stop}><div className="modal" onClick={stop}>{children}</div></div>;
};
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, busy = false, error = "", close, onConfirm }) {
  return <Modal><h2 className="title">{title}</h2><p className="copy">{message}</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close} disabled={busy}>Cancel</Button><Button className={danger ? "danger primary" : "primary"} disabled={busy} onClick={onConfirm}>{busy ? "Please wait…" : confirmLabel}</Button></div></Modal>;
}
// Dialog with a title row and Close button; `actions` render after the body.
export function DialogModal({ title, close, children, actions, className = "" }) {
  return <div className="modal-bg"><div className={`modal${className ? ` ${className}` : ""}`}><div className="row"><h2 className="title">{title}</h2><button type="button" className="btn" onClick={close}>Close</button></div>{children}{actions}</div></div>;
}
