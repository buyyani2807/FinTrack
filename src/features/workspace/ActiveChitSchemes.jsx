import { useEffect } from "react";
import { formatInr as money } from "../../lib/formatMoney.js";

// Active Chit Fund scheme cards shown under the owner dashboard; clicking a card opens that scheme.
// It uses the same .shell layout as the dashboard above, so its edges line up with the finance cards.
export function ActiveChitSchemes({ schemes = [], onOpen }) {
  const typeLabel = type => type === "fixed" ? "Fixed" : type === "fixed_predefined_bid" ? "Fixed Predefined Bid" : "Auction";
  useEffect(() => {
    const cards = [...document.querySelectorAll(".dashboard-chit-card")];
    const open = event => onOpen(event.currentTarget.dataset.schemeId);
    cards.forEach((card, index) => {
      card.dataset.schemeId = schemes[index]?.id || "";
      card.addEventListener("click", open);
    });
    return () => cards.forEach(card => card.removeEventListener("click", open));
  }, [onOpen, schemes]);
  return <section className="shell dashboard-chit"><div className="card dashboard-chit-panel"><div className="toolbar"><div className="dashboard-chit-heading"><div className="dashboard-chit-icon">◎</div><div><strong>Active Chit Fund Schemes</strong><p className="small">Current schemes across all Chit types</p></div></div><span className="badge active">{schemes.length} active</span></div>{schemes.length ? <div className="dashboard-chit-grid">{schemes.map(scheme => <article className="dashboard-chit-card" key={scheme.id}><span className="dashboard-chit-type">{typeLabel(scheme.chit_type)}</span><div className="dashboard-chit-name">{scheme.name}</div><div className="dashboard-chit-value">{money(scheme.chit_value)}</div><div className="dashboard-chit-stats"><div><span>Members</span><strong>{scheme.member_count}</strong></div><div><span>Duration</span><strong>{scheme.duration_months} months</strong></div></div></article>)}</div> : <p className="small spacer">No active Chit Fund schemes yet.</p>}</div></section>;
}
