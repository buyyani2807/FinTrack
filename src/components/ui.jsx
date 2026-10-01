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
export const Badge = ({
  status
}) => <span className={`badge ${status}`}>{status}</span>;
export const Modal = ({
  children
}) => <div className="modal-bg"><div className="modal">{children}</div></div>;
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, busy = false, error = "", close, onConfirm }) {
  return <Modal><h2 className="title">{title}</h2><p className="copy">{message}</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close} disabled={busy}>Cancel</Button><Button className={danger ? "danger primary" : "primary"} disabled={busy} onClick={onConfirm}>{busy ? "Please wait…" : confirmLabel}</Button></div></Modal>;
}
