export const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
export function PanelHead({ title, children }) {
  return <div className="accounts-panel-head spacer"><div><h2 className="accounts-panel-title">{title}</h2></div>{children}</div>;
}
export function EmptyState({ children }) {
  return <div className="card accounts-empty">{children}</div>;
}
export function Modal({ title, close, children, actions }) {
  return <div className="modal-bg"><div className="modal"><div className="row"><h2 className="title">{title}</h2><button type="button" className="btn" onClick={close}>Close</button></div>{children}{actions}</div></div>;
}
export function ButtonLike({ onClick, children }) {
  return <button type="button" className="btn" onClick={onClick}>{children}</button>;
}
