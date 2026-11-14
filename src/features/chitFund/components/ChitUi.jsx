import { BackButton, Badge as BaseBadge, Modal as BaseModal } from "../../../components/ui.jsx";

// Chit Fund variants of the shared primitives.
export const Badge = ({ status }) => <BaseBadge status={status} tone={status === "Completed" ? "completed" : status === "Draft" ? "active" : status} />;
export const Modal = ({ children, close }) => <BaseModal isolateClicks close={close}>{children}</BaseModal>;

// Back (always) plus the Chit Fund → Scheme → Member trail (hidden on narrow screens, where Back is enough).
/** Chit Fund → Scheme → Member trail. The last item is the current page. */
export function ChitBreadcrumb({ items, onBack }) {
  return <div className="chit-page-nav">{onBack ? <BackButton onClick={onBack} /> : null}<nav className="chit-breadcrumb" aria-label="Breadcrumb"><ol>
    {items.map((item, index) => {
      const last = index === items.length - 1;
      return <li key={`${item.label}-${index}`}>{last || !item.onClick
        ? <span aria-current={last ? "page" : undefined}>{item.label}</span>
        : <button type="button" className="chit-breadcrumb-link" onClick={item.onClick}>{item.label}</button>}</li>;
    })}
  </ol></nav></div>;
}

