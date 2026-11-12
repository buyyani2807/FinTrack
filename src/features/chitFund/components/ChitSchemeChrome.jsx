import { BackButton, Button, Spinner } from "../../../components/ui.jsx";
import { TabScroller } from "../../../components/TabScroller.jsx";
import { ChitSchemeHeaderActions } from "./ChitAdminControls.jsx";
import { chitSchemeSubtitle } from "../model/chitSchemeChrome.js";

export function ChitSchemeShell({
  scheme,
  workspace,
  enrollments = [],
  tabs,
  tab,
  onTabChange,
  back,
  canWrite = true,
  onAddMember,
  onSchemeDeleted,
  extra,
  token,
  error,
  notice,
  busy,
  overlays,
  children,
}) {
  return (
    <main className="shell">
      <BackButton onClick={back} />
      <div className="toolbar">
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
          onAddMember={canWrite ? onAddMember : null}
          onSchemeDeleted={canWrite ? onSchemeDeleted : null}
          extra={extra}
        />
      </div>
      <TabScroller>
        <div className="tabs spacer">
          {tabs.map(([id, label]) => (
            <Button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => onTabChange?.(id)}>{label}</Button>
          ))}
        </div>
      </TabScroller>
      {error && <p className="red small">{error}</p>}
      {notice && <p className="green small">{notice}</p>}
      {busy ? <Spinner label="Loading scheme details" /> : children}
      {overlays}
    </main>
  );
}
