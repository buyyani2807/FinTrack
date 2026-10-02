import { ignoreBankLine, matchBankLine as saveBankMatch } from "../../data/accountingRepository.js";
import { bankVoucherLines } from "../../model/accountingReports.js";
import { money, bankMatchLabel, bankMatchTone } from "../../accountsFormat.js";
import { BankMatchControls } from "../../components/BankMatchControls.jsx";

export function BankStatementCard({
  statement,
  suggested,
  unmatched,
  canWrite,
  saving,
  acceptSuggestedBankMatches,
  displayLines,
  accounts,
  vouchers,
  parties,
  matchedLineIds,
  matchChoice,
  setMatchChoice,
  run,
  token,
  openSimpleFromBankLine,
}) {
  return (
    <article className="card acc-bank-statement">
      <header className="acc-bank-statement-head">
        <div>
          <h3>{statement.accountName}</h3>
          <p className="small">{statement.statementDate}</p>
        </div>
        <div className="acc-bank-statement-stats">
          <span>Opening <strong>{money(statement.openingBalance)}</strong></span>
          <span>Closing <strong>{money(statement.closingBalance)}</strong></span>
          {suggested > 0 ? <span className="acc-status-pill suggested">{suggested} suggested</span> : null}
          <span className={`acc-status-pill ${unmatched ? "inactive" : "active"}`}>{unmatched ? `${unmatched} unmatched` : "Reconciled"}</span>
          {canWrite && suggested > 0 ? (
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() => acceptSuggestedBankMatches(displayLines)}
            >
              Accept all suggestions
            </button>
          ) : null}
        </div>
      </header>
      <div className="table acc-table-wrap acc-bank-match-table"><table><thead><tr><th>Date</th><th>Description</th><th className="acc-num">Amount</th><th>Status</th><th>Match to books</th></tr></thead><tbody>
        {displayLines.map(line => {
          const options = bankVoucherLines(accounts, vouchers, statement.coaId, parties).filter(item => !matchedLineIds.has(item.id) || item.id === line.matchedVoucherLineId);
          const selected = matchChoice[line.id] || line.matchedVoucherLineId || "";
          return <tr key={line.id}>
            <td>{line.lineDate}</td>
            <td>{line.description || "—"}{line.reference ? <span className="small"> · {line.reference}</span> : null}</td>
            <td className="acc-num">{money(line.amount)} <span className={`acc-voucher-chip ${line.direction === "out" ? "out" : "in"}`}>{line.direction === "out" ? "Out" : "In"}</span></td>
            <td><span className={`acc-status-pill ${bankMatchTone(line.matchStatus)}`}>{bankMatchLabel(line.matchStatus)}</span></td>
            <td className="acc-bank-match-select">
              <BankMatchControls
                line={line}
                selected={selected}
                options={options}
                saving={saving}
                canWrite={canWrite}
                onSelect={value => setMatchChoice(current => ({ ...current, [line.id]: value }))}
                onMatch={() => run(() => saveBankMatch(token, line.id, selected, "Matched"), "Line reconciled. Books unchanged.")}
                onUnmatch={() => run(() => saveBankMatch(token, line.id, null, "Unmatched"), "Line unmatched. Books unchanged.")}
                onIgnore={() => run(() => ignoreBankLine(token, line.id, "Ignored from statement"), "Line ignored. Books unchanged.")}
                onCreate={() => openSimpleFromBankLine(line, statement)}
              />
            </td>
          </tr>;
        })}
      </tbody></table></div>
      <div className="acc-bank-match-cards">
        {displayLines.map(line => {
          const options = bankVoucherLines(accounts, vouchers, statement.coaId, parties).filter(item => !matchedLineIds.has(item.id) || item.id === line.matchedVoucherLineId);
          const selected = matchChoice[line.id] || line.matchedVoucherLineId || "";
          return (
            <article key={line.id} className="card acc-bank-match-card">
              <div className="acc-bank-match-card-top">
                <strong>{line.description || "Statement line"}</strong>
                <span className={`acc-status-pill ${bankMatchTone(line.matchStatus)}`}>{bankMatchLabel(line.matchStatus)}</span>
              </div>
              <p className="small">{line.lineDate} · {money(line.amount)} · {line.direction === "out" ? "Out" : "In"}</p>
              <BankMatchControls
                line={line}
                selected={selected}
                options={options}
                saving={saving}
                canWrite={canWrite}
                onSelect={value => setMatchChoice(current => ({ ...current, [line.id]: value }))}
                onMatch={() => run(() => saveBankMatch(token, line.id, selected, "Matched"), "Line reconciled. Books unchanged.")}
                onUnmatch={() => run(() => saveBankMatch(token, line.id, null, "Unmatched"), "Line unmatched. Books unchanged.")}
                onIgnore={() => run(() => ignoreBankLine(token, line.id, "Ignored from statement"), "Line ignored. Books unchanged.")}
                onCreate={() => openSimpleFromBankLine(line, statement)}
              />
            </article>
          );
        })}
      </div>
    </article>
  );
}
