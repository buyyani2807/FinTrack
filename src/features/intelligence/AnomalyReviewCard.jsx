/** Read-only pattern list. Navigation only — nothing here posts, collects, or finalizes an auction. */
import { Info } from "lucide-react";
import { AttentionCenterCard } from "./AttentionCenterCard.jsx";

export function AnomalyReviewCard({ review, onNavigate, showWhenClear = false }) {
  if (!review) return null;
  const notes = review.notes || [];
  if (!review.items?.length && !notes.length && !showWhenClear) return null;

  const attention = {
    summary: review.summary,
    count: review.items?.length || 0,
    items: (review.items || []).map(item => ({
      id: item.id,
      module: item.module,
      severity: item.severity,
      title: `${item.label}. ${item.title}`,
      detail: item.detail,
      actionLabel: item.actionLabel,
      href: item.href,
    })),
    disclaimer: review.disclaimer,
  };

  const showList = Boolean(review.items?.length) || showWhenClear;

  return (
    <>
      {showList ? <AttentionCenterCard attention={attention} kicker="Review" onNavigate={onNavigate} /> : null}
      {notes.length ? (
        <section className="card attention-center" aria-label="Auction review">
          <ul className="attention-center-list">
            {notes.map(note => <li key={note} className="attention-center-item severity-low"><p className="small">{note}</p></li>)}
          </ul>
          <p className="attention-center-disclaimer"><Info size={13} aria-hidden="true" />The auction engine still decides the winner.</p>
        </section>
      ) : null}
    </>
  );
}
