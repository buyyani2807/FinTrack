import { Badge as BaseBadge, Modal as BaseModal } from "../../../components/ui.jsx";

// Chit Fund variants of the shared primitives.
export const Badge = ({ status }) => <BaseBadge status={status} tone={status === "Completed" ? "completed" : status === "Draft" ? "active" : status} />;
export const Modal = ({ children, close }) => <BaseModal isolateClicks close={close}>{children}</BaseModal>;
