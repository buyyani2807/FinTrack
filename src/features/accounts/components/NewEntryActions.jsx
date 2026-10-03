import { AccMoreMenu } from "./AccUi.jsx";
import { SIMPLE_ENTRY_KINDS } from "../model/accountingModel.js";

export function NewEntryActions({ openSimple, openVoucher, openParty }) {
  return (
    <AccMoreMenu
      label="New"
      align="end"
      buttonClassName="btn primary"
      items={[
        ...SIMPLE_ENTRY_KINDS.map(item => ({
          id: item.id,
          label: item.label,
          onClick: () => openSimple(item.id),
        })),
        { id: "more", separator: true },
        { id: "voucher", label: "Advanced voucher", onClick: openVoucher },
        { id: "party", label: "Party", onClick: openParty },
      ]}
    />
  );
}
