/** Advisory attention list — navigates only; never mutates books. */
import { useState } from "react";
import { ArrowRight, BookOpenText, CalendarDays, CalendarRange, ChevronDown, CircleCheck, Coins, Info, ListChecks } from "lucide-react";

const MODULES = {
  daily: { label: "Daily", icon: CalendarDays },
  monthly: { label: "Monthly", icon: CalendarRange },
  chit: { label: "Chit Fund", icon: Coins },
  accounts: { label: "Accounts", icon: BookOpenText },
  gst: { label: "GST", icon: BookOpenText },
};
// Long lists start short so the page below stays reachable on phones.
const INITIAL_ITEMS = 4;

export function AttentionCenterCard({ attention, onNavigate, kicker }) {
  const [expanded, setExpanded] = useState(false);
  if (!attention) return null;

  const items = attention.items || [];
  const heading = kicker || attention.kicker || "Attention center";
  const shown = expanded ? items : items.slice(0, INITIAL_ITEMS);
  const hidden = items.length - shown.length;

  return (
    <section className="card attention-center" aria-label={heading}>
      <header className="attention-center-head">
        <span className="ft-intel-icon" aria-hidden="true"><ListChecks size={20} /></span>
        <div className="attention-center-titles">
          <h2 className="attention-center-kicker">{heading}</h2>
          <p className="attention-center-summary">{attention.summary}</p>
        </div>
        {attention.count ? <span className="attention-center-count" aria-label={`${attention.count} items`}>{attention.count}</span> : null}
      </header>

      {!items.length ? (
        <p className="attention-center-empty"><CircleCheck size={18} aria-hidden="true" />Nothing urgent right now.</p>
      ) : (
        <ul className="attention-center-list">
          {shown.map(item => {
            const module = MODULES[item.module];
            const ModuleIcon = module?.icon;
            return (
              <li key={item.id} className={`attention-center-item severity-${item.severity || "medium"}`}>
                <div className="attention-center-text">
                  <strong>{item.title}</strong>
                  {item.detail ? <p className="small">{item.detail}</p> : null}
                </div>
                <div className="attention-center-foot">
                  {module ? <span className="attention-center-module"><ModuleIcon size={13} aria-hidden="true" />{module.label}</span> : <span />}
                  {onNavigate && item.href ? (
                    <button type="button" className="btn attention-center-action" onClick={() => onNavigate(item.href)}>
                      {item.actionLabel || "Open"}<ArrowRight size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 || expanded ? (
        <button type="button" className="ft-intel-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
          {expanded ? "Show fewer" : `Show ${hidden} more`}<ChevronDown size={16} aria-hidden="true" />
        </button>
      ) : null}

      {attention.disclaimer ? (
        <p className="attention-center-disclaimer"><Info size={13} aria-hidden="true" />{attention.disclaimer}</p>
      ) : null}
    </section>
  );
}
