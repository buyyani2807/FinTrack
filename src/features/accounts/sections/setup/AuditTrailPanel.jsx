import { AccPager, AccSetupSection, AccTable } from "../../components/AccUi.jsx";
import { formatIstDateTime } from "../../../../lib/dates.js";

export function AuditTrailPanel({ audit, pagedAudit, setListPage }) {
  return (
    <AccSetupSection
      icon="A"
      title="Audit trail"
      copy="Owner actions on books, parties, and settings. Posted amounts are not edited here."
      collapsible
      summary={`${audit.length} ${audit.length === 1 ? "event" : "events"}`}
    >
      <AccTable columns={["When (IST)", "Action", "Entity", "Before → After", "Reason"]} empty={!audit.length && "No accounting audit events yet."}>
        {pagedAudit.items.map(row => <tr key={row.id}>
          <td>{formatIstDateTime(row.createdAt)}</td>
          <td>{row.action}</td>
          <td>{row.entityType}</td>
          <td className="small">{row.oldValue || row.newValue ? `${JSON.stringify(row.oldValue || {})} → ${JSON.stringify(row.newValue || {})}` : "—"}</td>
          <td>{row.reason || "—"}</td>
        </tr>)}
      </AccTable>
      <AccPager page={pagedAudit.page} pages={pagedAudit.pages} total={pagedAudit.total} onPage={setListPage} noun="events" />
    </AccSetupSection>
  );
}
