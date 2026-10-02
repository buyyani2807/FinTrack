import { AccEmpty } from "../components/AccUi.jsx";
import { bankVoucherLines, defaultBankStatementLines } from "../model/accountingReports.js";
import { BankStatementImportPanel } from "./bank/BankStatementImportPanel.jsx";
import { BankStatementCard } from "./bank/BankStatementCard.jsx";

export function BankSection({
  onBankImportFile,
  bankImport,
  bankImportMapping,
  setBankImportMapping,
  applyBankImportMapping,
  bankForm,
  bankAccounts,
  setBankForm,
  patchBankLine,
  saving,
  submitBankStatement,
  statements,
  accounts,
  vouchers,
  parties,
  matchedLineIds,
  canWrite,
  acceptSuggestedBankMatches,
  matchChoice,
  setMatchChoice,
  run,
  token,
  openSimpleFromBankLine,
}) {
  return (
    <div className="acc-panel acc-bank">
      <p className="acc-bank-note">Matching marks statement lines against posted voucher lines. It never changes cash, bank, P&amp;L, or the trial balance.</p>
      <BankStatementImportPanel
        onBankImportFile={onBankImportFile}
        bankImport={bankImport}
        bankImportMapping={bankImportMapping}
        setBankImportMapping={setBankImportMapping}
        applyBankImportMapping={applyBankImportMapping}
        bankForm={bankForm}
        bankAccounts={bankAccounts}
        setBankForm={setBankForm}
        patchBankLine={patchBankLine}
        saving={saving}
        submitBankStatement={submitBankStatement}
      />
      <h3 className="acc-section-title">Saved statements</h3>
      {statements.map(statement => {
        const voucherLines = bankVoucherLines(accounts, vouchers, statement.coaId, parties).map(line => ({
          ...line,
          matched: matchedLineIds.has(line.id),
        }));
        const displayLines = defaultBankStatementLines(statement.lines, voucherLines);
        const unmatched = displayLines.filter(line => line.matchStatus !== "matched" && line.matchStatus !== "ignored").length;
        const suggested = displayLines.filter(line => line.matchStatus === "suggested").length;
        return <BankStatementCard
          key={statement.id}
          statement={statement}
          suggested={suggested}
          unmatched={unmatched}
          canWrite={canWrite}
          saving={saving}
          acceptSuggestedBankMatches={acceptSuggestedBankMatches}
          displayLines={displayLines}
          accounts={accounts}
          vouchers={vouchers}
          parties={parties}
          matchedLineIds={matchedLineIds}
          matchChoice={matchChoice}
          setMatchChoice={setMatchChoice}
          run={run}
          token={token}
          openSimpleFromBankLine={openSimpleFromBankLine}
        />;
      })}
      {!statements.length && <AccEmpty title="No bank statements yet" copy="Add opening, closing, and statement lines above. Matching never changes the books." />}
    </div>
  );
}
