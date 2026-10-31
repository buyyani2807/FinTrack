import { useMemo, useState } from "react";
import { Select } from "../../../components/Select.jsx";
import { AccEmpty } from "./AccUi.jsx";

export const CRM_STAGES = ["Lead", "Contacted", "Quoted", "Won", "Lost"];

export function CustomerPipeline({
  parties = [],
  pipeline = {},
  onStageChange,
  onAddMany,
  onAddLead,
  onOpenParty,
  canWrite = false,
  saving = false,
}) {
  const [pickId, setPickId] = useState("");
  const customers = useMemo(
    () => parties.filter(party => party.partyType === "customer" && party.isActive !== false),
    [parties],
  );
  // Opt-in board: only customers with a saved pipeline stage appear.
  const onBoard = useMemo(
    () => customers.filter(customer => pipeline[customer.id]),
    [customers, pipeline],
  );
  const offBoard = useMemo(
    () => customers.filter(customer => !pipeline[customer.id]),
    [customers, pipeline],
  );
  const byStage = useMemo(() => {
    const map = Object.fromEntries(CRM_STAGES.map(stage => [stage, []]));
    for (const customer of onBoard) {
      const stage = CRM_STAGES.includes(pipeline[customer.id]) ? pipeline[customer.id] : "Lead";
      map[stage].push(customer);
    }
    return map;
  }, [onBoard, pipeline]);

  const addExisting = () => {
    if (!pickId || !canWrite || saving) return;
    onStageChange?.(pickId, "Lead");
    setPickId("");
  };

  const addAllOffBoard = () => {
    if (!canWrite || saving || !offBoard.length) return;
    const ids = offBoard.map(customer => customer.id);
    if (onAddMany) onAddMany(ids, "Lead");
    else for (const id of ids) onStageChange?.(id, "Lead");
    setPickId("");
  };

  return (
    <div className="acc-panel acc-crm-panel">
      <div className="accounts-panel-head">
        <div>
          <h1 className="accounts-panel-title">Customer pipeline</h1>
          <p className="copy">
            Follow customers from first contact to won or lost. Stages are for follow-up only — they never change the books.
          </p>
        </div>
        <span className="accounts-industry-badge">CRM</span>
      </div>

      {canWrite ? (
        <div className="accounts-action-row crm-toolbar">
          <button type="button" className="btn primary" disabled={saving} onClick={() => onAddLead?.()}>
            + New lead
          </button>
          <div className="crm-add-existing">
            <Select
              className="crm-add-select"
              aria-label="Add existing customer to pipeline"
              value={pickId}
              disabled={saving || !offBoard.length}
              onChange={event => setPickId(event.target.value)}
            >
              <option value="">
                {offBoard.length ? "Select customer to add…" : "All customers are on the board"}
              </option>
              {offBoard.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}{customer.phone ? ` · ${customer.phone}` : ""}
                </option>
              ))}
            </Select>
            <button type="button" className="btn" disabled={saving || !pickId} onClick={addExisting}>
              Add to Lead
            </button>
          </div>
          {offBoard.length > 0 ? (
            <button type="button" className="btn" disabled={saving} onClick={addAllOffBoard}>
              {onBoard.length ? `Add remaining (${offBoard.length})` : `Add all ${offBoard.length} customers`}
            </button>
          ) : null}
        </div>
      ) : null}

      {!onBoard.length ? (
        <AccEmpty
          title="No one on the pipeline yet"
          copy={canWrite
            ? "Create a new lead, or pick an existing customer and add them to Lead."
            : "When customers are added to the pipeline, their stages will show here."}
          actionLabel={canWrite ? "+ New lead" : undefined}
          onAction={canWrite ? () => onAddLead?.() : undefined}
        />
      ) : (
        <div className="crm-pipeline-grid">
          {CRM_STAGES.map(stage => {
            const rows = byStage[stage];
            return (
              <section className="card crm-stage" key={stage}>
                <div className="crm-stage-head">
                  <strong>{stage}</strong>
                  <span>{rows.length}</span>
                </div>
                {rows.map(customer => (
                  <article className="crm-customer-card" key={customer.id}>
                    {onOpenParty ? (
                      <button type="button" className="crm-customer-name" onClick={() => onOpenParty(customer)}>
                        {customer.name}
                      </button>
                    ) : (
                      <strong>{customer.name}</strong>
                    )}
                    <span className="small">{customer.phone || customer.email || "No contact details"}</span>
                    {customer.notes ? <span className="small crm-customer-note">{customer.notes}</span> : null}
                    {canWrite ? (
                      <Select
                        disabled={saving}
                        value={stage}
                        onChange={event => onStageChange?.(customer.id, event.target.value)}
                        aria-label={`Stage for ${customer.name}`}
                      >
                        {CRM_STAGES.map(option => <option key={option} value={option}>{option}</option>)}
                      </Select>
                    ) : (
                      <span className="small">{stage}</span>
                    )}
                  </article>
                ))}
                {!rows.length && <p className="small crm-stage-empty">No customers here.</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
