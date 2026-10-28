import { ChevronDown } from "lucide-react";
import { AccMoreMenu } from "./AccUi.jsx";
import { SIMPLE_ENTRY_KINDS } from "../model/accountingModel.js";

export function NewEntryActions({ openSimple, openVoucher, openParty, openBookkeeper, openBulkImport = null }) {
  return (
    <AccMoreMenu
      label={<span className="acc-new-label">New <ChevronDown size={16} aria-hidden="true" /></span>}
      align="end"
      buttonClassName="btn primary"
      items={[
        ...(openBookkeeper ? [{ id: "describe", label: "Describe it in words", onClick: openBookkeeper }, { id: "describe-sep", separator: true }] : []),
        ...SIMPLE_ENTRY_KINDS.map(item => ({
          id: item.id,
          label: item.label,
          onClick: () => openSimple(item.id),
        })),
        { id: "more", separator: true },
        { id: "voucher", label: "Advanced voucher", onClick: openVoucher },
        { id: "party", label: "Party", onClick: openParty },
        ...(openBulkImport ? [{ id: "bulk", label: "Bulk import…", onClick: openBulkImport }] : []),
      ]}
    />
  );
}
