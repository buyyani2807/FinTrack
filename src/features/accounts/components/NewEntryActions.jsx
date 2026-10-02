import { AccMoreMenu } from "./AccUi.jsx";
import { Select } from "../../../components/Select.jsx";
import { SIMPLE_ENTRY_KINDS } from "../model/accountingModel.js";

export function NewEntryActions({ openSimple, openVoucher, openParty }) {
  return (
    <>
      <Select className="acc-new-entry" value="" placeholder="+ New entry" aria-label="New entry" onChange={event => { if (event.target.value) openSimple(event.target.value); }}>
        {SIMPLE_ENTRY_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </Select>
      <button type="button" className="btn primary acc-hide-mobile" onClick={openVoucher}>+ Voucher</button>
      <button type="button" className="btn acc-hide-mobile" onClick={openParty}>+ Party</button>
      <AccMoreMenu
        className="acc-show-mobile"
        label="More"
        items={[
          { id: "voucher", label: "+ Advanced voucher", onClick: openVoucher },
          { id: "party", label: "+ Party", onClick: openParty },
        ]}
      />
    </>
  );
}
