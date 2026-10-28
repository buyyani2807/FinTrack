import { AccTable, DateSortTh } from "../../components/AccUi.jsx";
import { money } from "../../accountsFormat.js";
import { useDateSort } from "../../model/useDateSort.js";
import { VoucherNumberLink } from "../../components/SalesInvoiceActions.jsx";

/** Sales / Purchases report table with clickable date sort (latest first by default). */
export function DateSortedVoucherTable({ rows, voucherType, empty, onViewDocument }) {
  const { sorted, direction, toggle } = useDateSort(rows, "date");
  return (
    <AccTable
      columns={[
        { label: <DateSortTh label="Date" direction={direction} onToggle={toggle} /> },
        "Number",
        "Narration",
        { label: "Amount", num: true },
        "View",
      ]}
      empty={!rows.length && empty}
    >
      {sorted.map(row => (
        <tr key={row.id}>
          <td>{row.date}</td>
          <td>
            <VoucherNumberLink
              number={row.voucherNumber}
              voucherType={voucherType}
              onView={onViewDocument ? () => onViewDocument(row) : null}
            />
          </td>
          <td>{row.narration}</td>
          <td className="acc-num">{money(row.debit)}</td>
          <td>{onViewDocument ? <button type="button" className="btn" onClick={() => onViewDocument(row)}>View</button> : null}</td>
        </tr>
      ))}
    </AccTable>
  );
}
