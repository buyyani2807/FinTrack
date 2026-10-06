import { money } from "../accountsFormat.js";
import { Select } from "../../../components/Select.jsx";

const suggestionLabel = suggestion => [suggestion.expenseName || suggestion.partyName, suggestion.reference].filter(Boolean).join(" · ");

export const BankMatchControls = ({ line, selected, options, saving, canWrite = true, onSelect, onMatch, onUnmatch, onIgnore, onCreate }) => (
  <>
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
          <button type="button" className="btn primary" disabled={saving || !selected} onClick={onMatch}>Match</button>
          <button type="button" className="btn" disabled={saving} onClick={onIgnore}>Ignore</button>
          {onCreate ? <button type="button" className="btn" disabled={saving} onClick={onCreate}>{line.entrySuggestion ? `Suggest ${suggestionLabel(line.entrySuggestion)}` : "Create entry"}</button> : null}
        </> : null}
  </>
);
