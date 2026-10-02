import { useState } from "react";
import { todayIso } from "../../../lib/dates.js";
import { Field, AccMetric, Modal } from "./AccUi.jsx";

export function ManufacturingWorkspace({ items = [], stockMovements = [], onItems, onTransactions, onProductionRun, saving = false }) {
  const rawMaterials = items.filter(item => /raw|material/i.test(`${item.name} ${item.categoryName || ""}`)).length;
  const finishedGoods = items.filter(item => /finished|product/i.test(`${item.name} ${item.categoryName || ""}`)).length;
  const [run, setRun] = useState({ date: todayIso(), materialId: "", materialQty: "", outputId: "", outputQty: "", note: "" });
  const [runOpen, setRunOpen] = useState(false);
  const products = items.filter(item => item.itemType === "product" && item.isActive !== false);
  const submitRun = async () => {
    if (!run.materialId || !run.outputId || Number(run.materialQty) <= 0 || Number(run.outputQty) <= 0 || run.materialId === run.outputId) return;
    const note = run.note.trim() || "Production run";
    const ok = await onProductionRun?.({
      date: run.date,
      note,
      materialId: run.materialId,
      materialQty: Math.abs(Number(run.materialQty)),
      outputId: run.outputId,
      outputQty: Math.abs(Number(run.outputQty)),
    });
    if (!ok) return;
    setRun({ date: todayIso(), materialId: "", materialQty: "", outputId: "", outputQty: "", note: "" });
    setRunOpen(false);
  };
  return <div className="acc-panel manufacturing-workspace">
    <div className="accounts-panel-head"><div><h1 className="accounts-panel-title">Manufacturing</h1><p className="copy">Plan production, control materials, and track finished goods.</p></div><span className="accounts-industry-badge">Manufacturing template</span></div>
    <div className="acc-metric-grid three spacer"><AccMetric label="Raw material items" value={rawMaterials} /><AccMetric label="Finished goods" value={finishedGoods} /><AccMetric label="Stock movements" value={stockMovements.length} /></div>
    <div className="manufacturing-flow-grid spacer">
      <button type="button" className="card manufacturing-flow-card" onClick={() => onItems?.()}><span className="manufacturing-flow-icon">▦</span><strong>1. Materials & items</strong><p className="copy">Create raw materials, WIP, and finished-goods items.</p></button>
      <button type="button" className="card manufacturing-flow-card" onClick={() => onTransactions?.()}><span className="manufacturing-flow-icon">▣</span><strong>2. Purchases & costs</strong><p className="copy">Record material purchases, labour, power, and production expenses.</p></button>
      <button type="button" className="card manufacturing-flow-card" onClick={() => setRunOpen(true)}><span className="manufacturing-flow-icon">→</span><strong>3. Production run</strong><p className="copy">Record material consumption and finished-goods output together.</p></button>
      <button type="button" className="card manufacturing-flow-card" onClick={() => onTransactions?.()}><span className="manufacturing-flow-icon">₹</span><strong>4. Sell & analyse</strong><p className="copy">Invoice finished goods and review margin, stock, and production costs.</p></button>
    </div>
    <div className="notice">Production runs use the existing auditable stock-movement workflow. Ledger posting and costing remain unchanged.</div>
    {runOpen && <Modal title="Record production run" close={() => !saving && setRunOpen(false)} actions={<div className="tabs spacer"><button type="button" className="btn primary" disabled={saving || !run.materialId || !run.outputId || Number(run.materialQty) <= 0 || Number(run.outputQty) <= 0 || run.materialId === run.outputId} onClick={submitRun}>{saving ? "Saving…" : "Save production run"}</button></div>}>
      <p className="copy">This records one material consumption and one finished-goods increase. Use a separate run for each batch.</p>
      <div className="form">
        <Field label="Date"><input type="date" value={run.date} onChange={event => setRun(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Material consumed"><select value={run.materialId} onChange={event => setRun(current => ({ ...current, materialId: event.target.value }))}><option value="">Select material</option>{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Material quantity"><input type="number" min="0" step="0.001" value={run.materialQty} onChange={event => setRun(current => ({ ...current, materialQty: event.target.value }))} /></Field>
        <Field label="Finished goods produced"><select value={run.outputId} onChange={event => setRun(current => ({ ...current, outputId: event.target.value }))}><option value="">Select output</option>{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Output quantity"><input type="number" min="0" step="0.001" value={run.outputQty} onChange={event => setRun(current => ({ ...current, outputQty: event.target.value }))} /></Field>
        <Field className="span" label="Batch note"><input value={run.note} placeholder="e.g. Batch 24 · 100 units" onChange={event => setRun(current => ({ ...current, note: event.target.value }))} /></Field>
      </div>
    </Modal>}
  </div>;
}
