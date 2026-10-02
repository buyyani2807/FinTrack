import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { loanStatus } from "../model/loanState.js";

const initialsOf = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() || "").join("") || "?";

// Users tab header: the chosen customer as a large selector (avatar, name, phone, status) with previous / next buttons
// and their position in the list. The native select covers the selector, so tapping it opens the system picker.
export function CustomerSwitcher({ accounts, selectedId, onChange, kindLabel }) {
  const index = accounts.findIndex(account => account.id === selectedId);
  const current = accounts[index] || null;
  const status = current ? loanStatus(current) : "";
  const step = offset => {
    const next = accounts[index + offset];
    if (next) onChange(next.id);
  };
  return <section className="card customer-switcher" aria-label="Choose customer">
    <label className="customer-switcher-select">
      <span className="customer-switcher-avatar" aria-hidden="true">{initialsOf(current?.customerName)}</span>
      <span className="customer-switcher-text" aria-hidden="true">
        <span className="customer-switcher-kicker">Customer</span>
        <strong>{current?.customerName || "Choose a customer"}</strong>
        {current && <span className="customer-switcher-meta">{current.phone}<i className={`customer-switcher-status is-${status}`}>{status}</i></span>}
      </span>
      <ChevronDown className="customer-switcher-chevron" size={20} aria-hidden="true" />
      <select aria-label="Customer" value={current?.id || ""} onChange={event => onChange(event.target.value)}>
        {!current && <option value="">Choose a customer…</option>}
        {accounts.map(account => <option key={account.id} value={account.id}>{`${account.customerName} · ${account.phone}${loanStatus(account) === "active" ? "" : ` · ${loanStatus(account)}`}`}</option>)}
      </select>
    </label>
    <div className="customer-switcher-nav">
      <span className="customer-switcher-count">{current ? <><b>{index + 1}</b> of {accounts.length}</> : `${accounts.length}`} {kindLabel} customer{accounts.length === 1 ? "" : "s"}</span>
      <span className="customer-switcher-steps">
        <button type="button" className="ft-icon-btn" aria-label="Previous customer" disabled={index <= 0} onClick={() => step(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <button type="button" className="ft-icon-btn" aria-label="Next customer" disabled={index < 0 || index >= accounts.length - 1} onClick={() => step(1)}><ChevronRight size={18} aria-hidden="true" /></button>
      </span>
    </div>
  </section>;
}
