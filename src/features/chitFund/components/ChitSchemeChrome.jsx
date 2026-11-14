import { Button, Spinner } from "../../../components/ui.jsx";
import { TabScroller } from "../../../components/TabScroller.jsx";
import { Toasts } from "../../../components/Toasts.jsx";
import { ChitSchemeHeaderActions } from "./ChitAdminControls.jsx";
import { ChitBreadcrumb } from "./ChitUi.jsx";
import { chitSchemeSubtitle } from "../model/chitSchemeChrome.js";

// One page frame for every Chit type: breadcrumb, business name, scheme title and terms,
// the scheme's actions (lift first, then type-specific, then delete), the section tabs,
// and floating success / error messages like the Chit Fund home page.
// Header primary action, the same rule for every type: while a scheme is a draft with free tickets it is
// Add member; once active it is the type's Lift Chit action (null when every month is lifted).
function primaryActionFor({ scheme, enrollments, canWrite, onAddMember, liftAction }) {
  if (!canWrite) return null;
  if (scheme.status === "draft" && onAddMember && enrollments.length < Number(scheme.member_count || 0)) {
    return <Button className="primary" onClick={onAddMember}>+ Add member</Button>;
  }
  if (scheme.status === "active") return liftAction || null;
  return null;
}

export function ChitSchemeShell({
  scheme,
  workspace,
  enrollments = [],
  tabs,
  tab,
  onTabChange,
  back,
  canWrite = true,
  onSchemeDeleted,
  onAddMember,
  liftAction,
  extra,
  token,
  error,
  notice,
  onClearError,
  onClearNotice,
  busy,
  overlays,
  children,
}) {
  return (
    <main className="shell chit-scheme-page">
      <ChitBreadcrumb onBack={back} items={[{ label: "Chit Fund", onClick: back }, { label: scheme.name }]} />
      <div className="toolbar chit-scheme-head">
        <div>
          <p className="page-company-name">{workspace?.businessName || "My Finance Business"}</p>
          <h1 className="title">{scheme.name}</h1>
          <p className="copy">{chitSchemeSubtitle(scheme, enrollments)}</p>
        </div>
        <ChitSchemeHeaderActions
          token={token}
          scheme={scheme}
          memberCount={enrollments.length}
          canWrite={canWrite}
          onSchemeDeleted={canWrite ? onSchemeDeleted : null}
          primaryAction={primaryActionFor({ scheme, enrollments, canWrite, onAddMember, liftAction })}
          extra={extra}
        />
      </div>
      <TabScroller>
        <nav className="tabs spacer chit-scheme-tabs" aria-label={`${scheme.name} sections`}>
          {tabs.map(([id, label]) => (
            <Button key={id} className={`tab ${tab === id ? "active" : ""}`} aria-current={tab === id ? "page" : undefined} onClick={() => onTabChange?.(id)}>{label}</Button>
          ))}
        </nav>
      </TabScroller>
      <Toasts items={[
        { id: "error", tone: "error", message: error, onClose: () => onClearError?.() },
        { id: "notice", message: notice, onClose: () => onClearNotice?.() },
      ]} />
      {busy ? <Spinner label="Loading scheme details" /> : children}
      {overlays}
    </main>
  );
}
