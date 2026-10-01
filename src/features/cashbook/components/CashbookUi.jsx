export { LabeledField as Field, DialogModal as Modal } from "../../../components/ui.jsx";
export function PanelHead({ title, children }) {
  return <div className="accounts-panel-head spacer"><div><h2 className="accounts-panel-title">{title}</h2></div>{children}</div>;
}
export function EmptyState({ children }) {
  return <div className="card accounts-empty">{children}</div>;
}
export function ButtonLike({ onClick, children }) {
  return <button type="button" className="btn" onClick={onClick}>{children}</button>;
}
