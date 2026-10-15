import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, Send, Sparkles, Undo2 } from "lucide-react";
import {
  SETUP_QUESTIONS,
  buildSetupPlan,
  financialYearStart,
  nextQuestion,
  normalizeBusinessProfile,
  profileBusiness,
  profileReply,
  questionText,
  suggestedAnswer,
  validateAnswer,
} from "../model/setupAssistant.js";
import { shortDate } from "../model/bookkeeper.js";
import { INDUSTRY_TEMPLATES } from "./AccOnboardingWizard.jsx";
import "../bookkeeper.css";

const BUSINESS_EXAMPLES = ["Electrical wholesale", "Kirana store", "Pharmacy", "Hardware shop", "IT consulting", "Garment manufacturing"];
const storageKey = companyId => `fintrack-setup-assistant-v1:${companyId || "none"}`;

function readSaved(companyId) {
  if (!companyId || typeof sessionStorage === "undefined") return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(companyId)) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

function writeSaved(companyId, value) {
  if (!companyId || typeof sessionStorage === "undefined") return;
  try {
    if (value) sessionStorage.setItem(storageKey(companyId), JSON.stringify(value));
    else sessionStorage.removeItem(storageKey(companyId));
  } catch {
    /* ignore quota */
  }
}

async function readBusinessWithAssistant(text, token) {
  if (!token || typeof fetch === "undefined") return null;
  try {
    const response = await fetch("/api/accounts/bookkeeper", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
      body: JSON.stringify({ kind: "business", text }),
    });
    if (!response.ok || !/json/i.test(response.headers.get("content-type") || "")) return null;
    const body = await response.json();
    return body?.profile ? normalizeBusinessProfile(body.profile, text) : null;
  } catch {
    return null;
  }
}

function answerLabel(question, value) {
  if (question.kind === "choice") return question.options.find(option => option.value === value)?.label || String(value);
  if (question.kind === "date") return shortDate(value);
  if (!value) return question.skipLabel || "Skip";
  return String(value);
}

/**
 * Conversational first-run setup. The parent applies the plan with `onApply`
 * and decides what "done" means; nothing is saved before the owner confirms.
 */
export function AccSetupAssistant({
  company = null,
  accounts = [],
  categories = [],
  vouchers = [],
  token = "",
  today = "",
  aiEnabled = false,
  canAdmin = false,
  saving = false,
  onApply,
  onDone,
  onSkip,
  onClassic,
  onOpenMigration,
}) {
  const companyId = company?.id || "";
  const saved = useMemo(() => readSaved(companyId), [companyId]);
  const [answers, setAnswers] = useState(() => saved?.answers || {});
  const [order, setOrder] = useState(() => saved?.order || []);
  const [profile, setProfile] = useState(() => saved?.profile || null);
  const [input, setInput] = useState(() => (nextQuestion(saved?.answers || {})?.id === "name" ? company?.name || "" : ""));
  const [error, setError] = useState("");
  const [thinking, setThinking] = useState(false);
  const [progress, setProgress] = useState([]);
  const [result, setResult] = useState(null);

  useEffect(() => {
    writeSaved(companyId, order.length ? { answers, order, profile } : null);
  }, [companyId, answers, order, profile]);

  const question = nextQuestion(answers);
  const defaultStart = company?.booksStartedOn || financialYearStart(today);

  const plan = useMemo(
    () => (question ? null : buildSetupPlan(answers, { profile, accounts, categories, vouchers, company })),
    [question, answers, profile, accounts, categories, vouchers, company],
  );

  const answer = async value => {
    if (!question || thinking) return;
    const cleaned = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value;
    const problem = validateAnswer(question, cleaned);
    if (problem) {
      setError(problem);
      return;
    }
    if (question.id === "business") {
      setThinking(true);
      let next = profileBusiness(cleaned);
      if (!next.known && aiEnabled) next = (await readBusinessWithAssistant(cleaned, token)) || next;
      setThinking(false);
      setProfile(next);
    }
    setAnswers(current => ({ ...current, [question.id]: cleaned }));
    setOrder(current => [...current.filter(id => id !== question.id), question.id]);
    setInput("");
    setError("");
  };

  const undo = () => {
    const last = order[order.length - 1];
    if (!last || saving) return;
    setAnswers(current => {
      const next = { ...current };
      delete next[last];
      if (last === "products") delete next.inventory;
      if (last === "gst") delete next.gstin;
      return next;
    });
    if (last === "business") setProfile(null);
    setInput(typeof answers[last] === "string" ? answers[last] : "");
    setError("");
    setOrder(current => current.filter(id => id !== last && !(last === "products" && id === "inventory") && !(last === "gst" && id === "gstin")));
    setResult(null);
    setProgress([]);
  };

  const apply = async () => {
    if (!onApply || !canAdmin || saving) return;
    setProgress([]);
    setResult(null);
    const outcome = await onApply(answers, profile, update => setProgress(current => {
      const rest = current.filter(item => item.label !== update.label);
      return [...rest, update];
    }));
    if (outcome) {
      setResult(outcome);
      if (!outcome.failed?.length) writeSaved(companyId, null);
    }
  };

  const template = INDUSTRY_TEMPLATES.find(item => item.id === profile?.industry);
  const suggested = suggestedAnswer(question, profile);
  const answered = order.map(id => SETUP_QUESTIONS.find(item => item.id === id)).filter(Boolean);
  const finished = result && !result.failed?.length;

  return (
    <section className="card acc-bk acc-setup" aria-label="Set up your books">
      <header className="acc-bk-head">
        <span className="acc-bk-icon" aria-hidden="true"><Sparkles size={18} /></span>
        <div>
          <h2 className="acc-bk-title">Set up your books</h2>
          <p className="acc-bk-sub">Answer a few questions in your own words. FinTrack sets up the ledgers, banks, GST and stock categories for you. Nothing is saved until you confirm.</p>
        </div>
        <div className="acc-setup-head-actions">
          {onClassic && <button type="button" className="acc-ov-link-btn" disabled={saving} onClick={onClassic}>Use the step-by-step form</button>}
          {onSkip && <button type="button" className="btn" disabled={saving} onClick={onSkip}>Skip for now</button>}
        </div>
      </header>

      <div className="acc-bk-thread">
        {answered.map(item => (
          <div key={item.id} className="acc-setup-turn">
            <p className="acc-setup-ask">{questionText(item, answers, profile)}</p>
            <p className="acc-bk-said">{answerLabel(item, answers[item.id])}</p>
            {item.id === "business" && profile && (
              <p className="acc-setup-ask">
                {profileReply(profile)}
                {template && <span className="acc-setup-tag">{template.label}</span>}
              </p>
            )}
          </div>
        ))}

        {question && (
          <div className="acc-setup-turn">
            <p className="acc-setup-ask is-current">{questionText(question, answers, profile)}</p>
            <div className="acc-setup-answer">
              {question.kind === "choice" && (
                <div className="acc-bk-choices">
                  {question.options.map(option => (
                    <button
                      key={String(option.value)}
                      type="button"
                      className={`acc-bk-chip${suggested === option.value ? " is-suggested" : ""}`}
                      onClick={() => answer(option.value)}
                    >
                      {option.label}{suggested === option.value ? " · usual for you" : ""}
                    </button>
                  ))}
                </div>
              )}

              {question.kind === "text" && (
                <>
                  <form className="acc-bk-form" onSubmit={event => { event.preventDefault(); answer(input); }}>
                    <input
                      aria-label={question.placeholder}
                      value={input}
                      maxLength={question.id === "gstin" ? 15 : 120}
                      placeholder={question.placeholder}
                      autoFocus={order.length > 0}
                      onChange={event => setInput(question.id === "gstin" ? event.target.value.toUpperCase() : event.target.value)}
                    />
                    <button type="submit" className="btn primary" disabled={thinking || !input.trim()}>
                      {thinking ? <LoaderCircle size={15} className="acc-setup-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                      {thinking ? "Thinking…" : "Next"}
                    </button>
                  </form>
                  <div className="acc-bk-choices">
                    {question.id === "business" && BUSINESS_EXAMPLES.map(example => (
                      <button key={example} type="button" className="acc-bk-chip" disabled={thinking} onClick={() => answer(example)}>{example}</button>
                    ))}
                    {question.suggestions?.map(name => (
                      <button key={name} type="button" className="acc-bk-chip" onClick={() => setInput(current => (current.trim() ? `${current.trim()}, ${name}` : name))}>+ {name}</button>
                    ))}
                    {question.skipLabel && <button type="button" className="acc-bk-chip" onClick={() => answer("")}>{question.skipLabel}</button>}
                  </div>
                </>
              )}

              {question.kind === "date" && (
                <div className="acc-bk-choices">
                  {defaultStart && <button type="button" className="acc-bk-chip is-suggested" onClick={() => answer(defaultStart)}>{shortDate(defaultStart)}{defaultStart === financialYearStart(today) ? " · start of this financial year" : ""}</button>}
                  {today && today !== defaultStart && <button type="button" className="acc-bk-chip" onClick={() => answer(today)}>Today, {shortDate(today)}</button>}
                  <form className="acc-setup-date" onSubmit={event => { event.preventDefault(); answer(input); }}>
                    <input type="date" aria-label="Books start date" value={input} max={today || undefined} onChange={event => setInput(event.target.value)} />
                    <button type="submit" className="btn" disabled={!input}>Use this date</button>
                  </form>
                </div>
              )}
              {error && <p className="acc-bk-errors" role="alert">{error}</p>}
            </div>
          </div>
        )}

        {plan && (
          <div className="acc-bk-reply acc-setup-plan">
            <p className="acc-bk-reply-lead">{finished ? "Your books are ready." : "Here is the setup I will create."}</p>
            <ul className="acc-setup-summary">
              {plan.summary.map(item => (
                <li key={item.id}>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <span><strong>{item.title}</strong> {item.detail}</span>
                </li>
              ))}
            </ul>
            {plan.existing.length > 0 && <p className="small">Already in your books, so I will leave them: {plan.existing.join(", ")}.</p>}

            {progress.length > 0 && (
              <ul className="acc-setup-progress" aria-live="polite">
                {progress.map(item => (
                  <li key={item.label} className={`is-${item.status}`}>
                    {item.status === "running" && <LoaderCircle size={14} className="acc-setup-spin" aria-hidden="true" />}
                    {item.status === "done" && <CheckCircle2 size={14} aria-hidden="true" />}
                    {item.status === "failed" && <CircleAlert size={14} aria-hidden="true" />}
                    <span>{item.label}{item.message ? `: ${item.message}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {result?.failed?.length > 0 && <p className="acc-bk-errors" role="alert">{result.failed.length === 1 ? "One step" : `${result.failed.length} steps`} did not finish. Fix the problem and run setup again; finished steps are skipped.</p>}

            <div className="acc-bk-actions">
              {finished ? (
                <>
                  <button type="button" className="btn primary" onClick={onDone}>Start using FinTrack</button>
                  {onOpenMigration && <button type="button" className="btn" onClick={onOpenMigration}>Bring my data from Tally, Zoho or Excel</button>}
                </>
              ) : (
                <>
                  <button type="button" className="btn primary" disabled={!canAdmin || saving} onClick={apply}>{saving ? "Setting up…" : "Set up my books"}</button>
                  {!canAdmin && <span className="small">Only the owner can finish setup.</span>}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {order.length > 0 && !finished && (
        <div className="acc-setup-foot">
          <button type="button" className="acc-ov-link-btn" disabled={saving || thinking} onClick={undo}><Undo2 size={13} aria-hidden="true" /> Change my last answer</button>
        </div>
      )}
    </section>
  );
}
