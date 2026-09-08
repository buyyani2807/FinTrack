/** Advisory attention list — navigates only; never mutates books. */

export function AttentionCenterCard({ attention, onNavigate }) {
  if (!attention) return null;

  const items = attention.items || [];

  return (
    <section className="card attention-center">
      <header className="attention-center-head">
        <div>
          <p className="attention-center-kicker">Attention center</p>
          <p className="attention-center-summary">{attention.summary}</p>
        </div>
        {attention.count ? <span className="attention-center-count">{attention.count}</span> : null}
      </header>

      {!items.length ? (
        <p className="attention-center-empty small">Nothing urgent right now.</p>
      ) : (
        <ul className="attention-center-list">
          {items.map(item => (
            <li key={item.id} className={`attention-center-item severity-${item.severity || "medium"}`}>
              <div>
                <strong>{item.title}</strong>
                {item.detail ? <p className="small">{item.detail}</p> : null}
              </div>
              {onNavigate && item.href ? (
                <button type="button" className="btn" onClick={() => onNavigate(item.href)}>
                  {item.actionLabel || "Open"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {attention.disclaimer ? (
        <p className="attention-center-disclaimer small">{attention.disclaimer}</p>
      ) : null}
    </section>
  );
}
