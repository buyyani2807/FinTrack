import {
  MONEY_MODES,
  SIMPLE_EXPENSE_CODES,
  addDaysIso,
  moneyAccounts,
  prepareGstAmount,
  roundMoney,
  salePaymentSummary,
  cashUpiSplitIsValid,
} from "../model/accountingModel.js";
import { gstStateFromGstin, isIntraGst } from "../model/accountingGst.js";
import { suggestBillWiseAllocations } from "../model/accountingReports.js";
import { aggregateItemizedGst, emptyItemLine, usesItemLines } from "../model/inventoryModel.js";
import { money } from "../accountsFormat.js";
import { Field } from "./AccUi.jsx";
import { EntryAmountSection } from "./simpleEntry/EntryAmountSection.jsx";
import { ItemLinesSection } from "./simpleEntry/ItemLinesSection.jsx";
import { SaleSummaryCard } from "./simpleEntry/SaleSummaryCard.jsx";
import { BillwiseSettlement } from "./simpleEntry/BillwiseSettlement.jsx";

export function SimpleEntryForm({ kind, accounts, parties, form, setForm, onSubmit, saving, maxDate, gstCompany, onGstSetup, items = [], stockByItem = {}, openInvoices = [] }) {
  const customers = parties.filter(party => party.partyType === "customer" && (party.isActive !== false || party.id === form.partyId));
  const suppliers = parties.filter(party => party.partyType === "supplier" && (party.isActive !== false || party.id === form.partyId));
  const expenseOptions = SIMPLE_EXPENSE_CODES.filter(([code]) => accounts.some(account => account.code === code) || code === "5990");
  const transferAccounts = moneyAccounts(accounts).filter(account => account.isActive !== false);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const needsParty = kind === "sale" || kind === "receipt" || kind === "credit_note" ? "customer"
    : kind === "purchase" || kind === "payment" || kind === "debit_note" ? "supplier"
    : null;
  const partyList = needsParty === "supplier" ? suppliers : customers;
  const gstKinds = kind === "sale" || kind === "purchase" || kind === "credit_note" || kind === "debit_note";
  const gstOn = gstCompany?.gstRegistration === "regular" && gstKinds;
  const selectedParty = parties.find(party => party.id === form.partyId);
  const partyState = selectedParty?.stateCode || gstStateFromGstin(selectedParty?.gstin);
  const intra = isIntraGst(gstCompany?.stateCode, partyState);
  const returnKind = kind === "credit_note" || kind === "debit_note";
  const itemMode = usesItemLines(kind, form);
  const settlementKinds = kind === "receipt" || kind === "payment" || kind === "credit_note" || kind === "debit_note";
  const partyOpenInvoices = settlementKinds && form.partyId
    ? (openInvoices || []).filter(row => row.partyId === form.partyId && Number(row.outstanding || 0) > 0)
    : [];
  const settlementTotal = roundMoney((form.settlements || []).reduce((sum, link) => sum + Number(link.amount || 0), 0));
  const syncSettlements = (partyId, amount) => {
    const open = (openInvoices || []).filter(row => row.partyId === partyId && Number(row.outstanding || 0) > 0);
    return suggestBillWiseAllocations(open, amount);
  };
  const activeItems = items.filter(item => item.isActive !== false || (form.itemLines || []).some(line => line.itemId === item.id));
  const itemPreview = itemMode
    ? aggregateItemizedGst(form.itemLines || [], { intra, taxInclusive: false })
    : null;
  const settlementAmount = itemMode
    ? Number((gstOn ? itemPreview?.total : itemPreview?.taxable) || 0)
    : form.amount;
  const gstPreview = !itemMode && gstOn
    ? prepareGstAmount(form.amount, { enabled: Number(form.gstRate) > 0, rate: form.gstRate, intra, taxInclusive: form.taxInclusive, hsnSac: form.hsnSac })
    : null;
  const invoiceTotalPreview = kind === "sale"
    ? (itemMode
      ? (gstOn ? Number(itemPreview?.total || itemPreview?.taxable || 0) : Number(itemPreview?.taxable || 0))
      : (gstOn && Number(form.gstRate) > 0 ? Number(gstPreview?.total || 0) : Number(form.amount || 0)))
    : 0;
  const amountReceivedNow = kind === "sale" && form.settlement === "credit"
    ? Number(form.amountReceived || 0)
    : kind === "sale" && form.settlement === "paid"
      ? invoiceTotalPreview
      : 0;
  const saleSummary = kind === "sale" && invoiceTotalPreview > 0
    ? (() => {
      try {
        return salePaymentSummary({
          invoiceTotal: invoiceTotalPreview,
          amountReceived: amountReceivedNow,
        });
      } catch {
        return null;
      }
    })()
    : null;
  const showReceivedOnCredit = kind === "sale" && form.settlement === "credit";
  const showMoneyMode = kind !== "transfer" && kind !== "credit_note" && kind !== "debit_note"
    && (kind === "expense" || kind === "receipt" || kind === "payment" || form.settlement === "paid"
      || (showReceivedOnCredit && Number(form.amountReceived || 0) > 0));
  const splitTargetAmount = showReceivedOnCredit
    ? Number(form.amountReceived || 0)
    : ((kind === "sale" || kind === "purchase") && form.settlement === "paid"
      ? invoiceTotalPreview
      : Number(form.amount || 0));
  const splitEntered = roundMoney(Number(form.receivedCash || 0) + Number(form.receivedUpi || 0));
  const cashUpiValid = form.moneyMode !== "cash_upi"
    || !(splitTargetAmount > 0)
    || cashUpiSplitIsValid(form.moneyMode, splitTargetAmount, {
      cash: Number(form.receivedCash || 0),
      upi: Number(form.receivedUpi || 0),
    });
  const noteCopy = kind === "credit_note"
    ? (itemMode
      ? "Sales return: returned items go back into stock, and the customer balance and sales reduce. Original invoices stay in Day Book."
      : "Reduces the customer balance and sales. Original invoices stay in Day Book.")
    : kind === "debit_note"
      ? (itemMode
        ? "Purchase return: returned items leave stock, and the supplier balance and purchases reduce. Original invoices stay in Day Book."
        : "Reduces the supplier balance and purchases. Original invoices stay in Day Book.")
      : kind === "sale"
        ? "Sale value is always the full invoice. Amount received is a separate collection against that invoice — never a reduced sale."
        : "FinTrack posts the balanced voucher for you. Open + Voucher if you need a custom journal.";

  const patchItemLine = (index, patch) => {
    setForm(current => {
      const itemLines = [...(current.itemLines || [emptyItemLine()])];
      itemLines[index] = { ...itemLines[index], ...patch };
      return { ...current, itemLines };
    });
  };

  const selectItem = (index, itemId) => {
    const item = items.find(row => row.id === itemId);
    if (!item) {
      patchItemLine(index, { itemId: "", itemName: "", itemSku: "", itemType: "product", unit: "Nos" });
      return;
    }
    const defaultRate = kind === "sale" || kind === "credit_note" ? item.sellingPrice : item.purchasePrice;
    patchItemLine(index, {
      itemId: item.id,
      itemName: item.name,
      itemSku: item.sku,
      itemType: item.itemType,
      unit: item.unit,
      gstRate: String(item.gstRate ?? 0),
      hsnSac: item.hsnSac || "",
      rate: form.itemLines?.[index]?.rateTouched ? form.itemLines[index].rate : String(defaultRate || ""),
    });
  };

  return <>
    <p className="copy">{noteCopy}</p>
    <section className="acc-form-section">
      <h3 className="acc-form-section-title">Details</h3>
      <div className="form">
        <Field label="Date"><input type="date" max={maxDate} value={form.date} onChange={event => set({ date: event.target.value })} /></Field>
        {(kind === "sale" || kind === "purchase") && (
          <Field label="Payment">
            <select value={form.settlement} onChange={event => set({
              settlement: event.target.value,
              amountReceived: event.target.value === "paid" ? "" : form.amountReceived,
            })}>
              <option value="credit">Credit / invoice</option>
              <option value="paid">Paid in full now</option>
            </select>
          </Field>
        )}
        {showMoneyMode && (
          <Field label="Payment mode">
            <select value={form.moneyMode} onChange={event => set({ moneyMode: event.target.value, receivedCash: "", receivedUpi: "" })}>
              {MONEY_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
          </Field>
        )}
        {(kind === "sale" || kind === "purchase") && form.settlement === "credit" && <Field label="Due date"><input type="date" value={form.dueDate || addDaysIso(form.date, 7)} onChange={event => set({ dueDate: event.target.value })} /></Field>}
        {kind === "expense" && <Field label="Expense"><select value={form.expenseCode} onChange={event => set({ expenseCode: event.target.value })}>{expenseOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field>}
        {kind === "transfer" && <>
          <Field label="From"><select value={form.fromAccountId || ""} onChange={event => set({ fromAccountId: event.target.value })}><option value="">Select account</option>{transferAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
          <Field label="To"><select value={form.toAccountId || ""} onChange={event => set({ toAccountId: event.target.value })}><option value="">Select account</option>{transferAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></Field>
        </>}
        {needsParty && <Field label={needsParty === "supplier" ? "Supplier" : "Customer"}><select value={form.partyId} onChange={event => {
          const partyId = event.target.value;
          set({
            partyId,
            settlements: settlementKinds ? syncSettlements(partyId, settlementAmount) : form.settlements,
          });
        }}><option value="">Select</option>{partyList.map(party => <option key={party.id} value={party.id}>{party.name}</option>)}</select></Field>}
        {(kind === "sale" || kind === "purchase") && (
          <Field label="Entry">
            <select value={itemMode ? "items" : "amount"} onChange={event => set({ entryMode: event.target.value })}>
              <option value="items">Line items</option>
              <option value="amount">Single amount</option>
            </select>
          </Field>
        )}
        {returnKind && (
          <Field label="Entry">
            <select value={itemMode ? "items" : "amount"} onChange={event => set({ noteEntryMode: event.target.value, settlements: [] })}>
              <option value="amount">Amount only (rate difference / discount)</option>
              <option value="items">Returned items (updates stock)</option>
            </select>
          </Field>
        )}
      </div>
    </section>

    {!itemMode && (
      <EntryAmountSection
        kind={kind}
        form={form}
        set={set}
        settlementKinds={settlementKinds}
        syncSettlements={syncSettlements}
        showReceivedOnCredit={showReceivedOnCredit}
        showMoneyMode={showMoneyMode}
        cashUpiValid={cashUpiValid}
        splitTargetAmount={splitTargetAmount}
        splitEntered={splitEntered}
        itemMode={itemMode}
        gstKinds={gstKinds}
        gstOn={gstOn}
        intra={intra}
        partyState={partyState}
        gstCompany={gstCompany}
        onGstSetup={onGstSetup}
      />
    )}

    {itemMode && (
      <ItemLinesSection
        form={form}
        stockByItem={stockByItem}
        selectItem={selectItem}
        activeItems={activeItems}
        patchItemLine={patchItemLine}
        setForm={setForm}
        itemPreview={itemPreview}
        gstOn={gstOn}
        showReceivedOnCredit={showReceivedOnCredit}
        set={set}
        showMoneyMode={showMoneyMode}
        cashUpiValid={cashUpiValid}
        splitTargetAmount={splitTargetAmount}
        splitEntered={splitEntered}
        gstKinds={gstKinds}
        gstCompany={gstCompany}
        kind={kind}
        onGstSetup={onGstSetup}
      />
    )}

    {gstPreview && Number(form.amount) > 0 && Number(form.gstRate) > 0 && (
      <p className="small acc-gst-preview">
        Taxable {money(gstPreview.taxable)}
        {gstPreview.supplyType === "intra" ? ` · CGST ${money(gstPreview.cgst)} · SGST ${money(gstPreview.sgst)}` : ` · IGST ${money(gstPreview.igst)}`}
        {` · Total ${money(gstPreview.total)}`}
      </p>
    )}

    {saleSummary && (
      <SaleSummaryCard saleSummary={saleSummary} form={form} />
    )}

    {settlementKinds && form.partyId && (
      <BillwiseSettlement
        partyOpenInvoices={partyOpenInvoices}
        form={form}
        setForm={setForm}
        settlementTotal={settlementTotal}
        set={set}
        syncSettlements={syncSettlements}
      />
    )}

    <div className="tabs spacer"><button type="button" className="btn primary" disabled={saving || (settlementKinds && settlementTotal > Number(form.amount || 0) + 0.001) || (saleSummary && saleSummary.amountReceived > saleSummary.invoiceTotal + 0.001) || (showMoneyMode && form.moneyMode === "cash_upi" && splitTargetAmount > 0 && !cashUpiValid)} onClick={onSubmit}>{saving ? "Saving…" : "Save"}</button></div>
  </>;
}
