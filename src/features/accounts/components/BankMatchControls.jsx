import { money } from "../accountsFormat.js";
import { reconciliationReview } from "../model/bookSuggestions.js";
import { Select } from "../../../components/Select.jsx";

const suggestionLabel = suggestion => [suggestion.expenseName || suggestion.partyName, suggestion.reference].filter(Boolean).join(" · ");

export const BankMatchControls = ({ line, selected, options, saving, canWrite = true, onSelect, onMatch, onUnmatch, onIgnore, onCreate }) => {
  const review = reconciliationReview(line);
  const suggested = line.matchStatus === "suggested" || Boolean(line.entrySuggestion);
  return (
  <>
    {review ? (
      <div className="acc-bank-review">
        <p className="small">Proposed: {review.proposal || "—"}</p>
        <p className="small">Confidence: {review.confidence == null ? "From the statement text" : `${review.confidence}%`}</p>
        <p className="small">Reason: {review.reason || "—"}</p>
        <p className="small">Records: {review.records.join(", ") || "—"}</p>
        <p className="small">Difference: {money(review.difference)}</p>
      </div>
    ) : null}
    {line.matchHint ? <p className="small acc-bank-match-hint">{line.matchHint}</p> : null}
    <Select value={selected} onChange={event => onSelect(event.target.value)} disabled={!canWrite || line.matchStatus === "matched" || line.matchStatus === "ignored"}>
      <option value="">Choose books line</option>
      {(line.matchCandidates?.length ? line.matchCandidates : options).map(item => (
        <option key={item.id} value={item.id}>
          {item.date} · {item.voucherNumber} · {money(item.amount)}{item.confidence != null ? ` · ${item.confidence}%` : ""}
        </option>
      ))}
      {options.filter(item => !(line.matchCandidates || []).some(candidate => candidate.id === item.id)).map(item => (
        <option key={item.id} value={item.id}>{item.date} · {item.voucherNumber} · {money(item.amount)}</option>
      ))}
    </Select>
    {line.matchStatus === "matched"
      ? (canWrite ? <button type="button" className="btn" disabled={saving} onClick={onUnmatch}>Unmatch</button> : null)
      : line.matchStatus === "ignored"
        ? (canWrite ? <button type="button" className="btn" disabled={saving} onClick={onUnmatch}>Restore</button> : null)
        : canWrite ? <>
          <button type="button" className="btn primary" disabled={saving || !selected} onClick={onMatch}>{suggested && line.matchStatus === "suggested" ? "Accept" : "Match"}</button>
          <button type="button" className="btn" disabled={saving} onClick={onIgnore}>{suggested ? "Reject" : "Ignore"}</button>
          {onCreate ? <button type="button" className="btn" disabled={saving} onClick={onCreate}>{line.entrySuggestion ? `Edit ${suggestionLabel(line.entrySuggestion)}` : "Create entry"}</button> : null}
        </> : null}
  </>
  );
};
