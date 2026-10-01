import { AccSetupSection } from "../../components/AccUi.jsx";
import { ledgerHasPostedLines } from "../../accountingModel.js";
import { money } from "../../accountsFormat.js";

export function ChartOfAccountsPanel({ settings, openCoa, visibleAccounts, vouchers, saving, removeCoa }) {
  return (
    <AccSetupSection
      icon="#"
      title="Chart of accounts"
      copy={`Opening debit and credit sides across the chart should balance. System accounts can be renamed and given openings, but not deleted.${settings?.integrationEnabled ? "" : " Daily Finance, Monthly Finance, and Chit Fund ledgers stay hidden while integration is off."}`}
      actions={<button type="button" className="btn" onClick={() => openCoa(null)}>+ Account</button>}
      collapsible
      summary={`${visibleAccounts.length} ${visibleAccounts.length === 1 ? "account" : "accounts"}`}
    >
      <div className="table spacer acc-table-wrap"><table><thead><tr><th>Code</th><th>Account</th><th>Group</th><th>Opening</th><th></th></tr></thead><tbody>
        {visibleAccounts.map(account => {
          const used = ledgerHasPostedLines(account, vouchers);
          return <tr key={account.id}>
            <td>{account.code}</td>
            <td style={account.parentId ? { paddingLeft: 22 } : undefined}>{account.parentId ? "↳ " : ""}{account.name}{account.isSystem ? " · system" : ""}</td>
            <td>{account.groupType}</td>
            <td>{account.openingBalance ? `${money(account.openingBalance)} ${account.openingSide}` : "—"}</td>
            <td>
              <button type="button" className="btn" disabled={saving} onClick={() => openCoa(account)}>Edit</button>
              <button type="button" className="btn danger" disabled={saving || account.isSystem || used} onClick={() => removeCoa(account)}>{account.isSystem ? "System" : used ? "In use" : "Delete"}</button>
            </td>
          </tr>;
        })}
      </tbody></table></div>
    </AccSetupSection>
  );
}
