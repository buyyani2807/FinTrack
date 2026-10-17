import { useState } from "react";
import { Modal } from "./AccUi.jsx";

export function CaBriefSheet({ brief, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const printBrief = () => {
    document.body.classList.add("ca-brief-print");
    const done = () => document.body.classList.remove("ca-brief-print");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  };

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief.text);
      setCopied(true);
      setCopyError("");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Could not copy. Use Print and save it as a PDF.");
    }
  };

  return (
    <Modal title="Brief for the CA" close={onClose}>
      <article className="ca-brief-sheet">
        <div className="ca-brief-actions tabs">
          <button type="button" className="btn primary" onClick={printBrief}>Print</button>
          <button type="button" className="btn" onClick={copyBrief}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <header>
          <p className="ca-brief-kicker">For the chartered accountant</p>
          <h3>{brief.companyName}</h3>
          {brief.gstin ? <p className="small">GSTIN {brief.gstin}</p> : null}
          <p className="small">{brief.monthTitle} · Prepared {brief.preparedOn}</p>
          <p className="small">{brief.locked ? "This month is locked." : "This month is open. Locking it is a separate step."} Readiness {brief.readinessPct}%.</p>
        </header>
        <p className="ca-brief-note">{brief.disclaimer}</p>
        <section>
          <h4>What changed</h4>
          <dl>
            {brief.changed.flatMap(row => [
              <dt key={`${row.label}-label`}>{row.label}</dt>,
              <dd key={`${row.label}-value`}>{row.value}</dd>,
            ])}
          </dl>
        </section>
        <section>
          <h4>What does not match</h4>
          {brief.mismatches.length ? <ul>
            {brief.mismatches.map(row => <li key={row.title}><strong>{row.title}.</strong> {row.detail}</li>)}
          </ul> : <p>Nothing in these checks is still open.</p>}
        </section>
        <section>
          <h4>Questions for the owner</h4>
          <ol>{brief.questions.map(question => <li key={question}>{question}</li>)}</ol>
        </section>
        {copyError ? <p className="small">{copyError}</p> : null}
      </article>
    </Modal>
  );
}
