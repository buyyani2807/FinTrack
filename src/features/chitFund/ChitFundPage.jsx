import { useEffect, useMemo, useState } from "react";
import { Toasts } from "../../components/Toasts.jsx";
import { TabScroller } from "../../components/TabScroller.jsx";
import {
  activateChitScheme,
  createChitScheme,
  createFixedChitScheme,
  createPredefinedBidChitScheme,
  invalidateChitDashboardCache,
  loadChitBoardRelated,
  loadChitDashboard,
  loadChitSchemes,
  seedChitDashboardCache,
  updateFixedChitScheme,
  updateChitScheme,
} from "../../lib/financeRepository";
import { ReceiptSuccessModal } from "../receipts/components/ReceiptActions.jsx";
import { UpcomingPaymentsSection } from "../receipts/components/UpcomingPaymentsSection.jsx";
import { ChitInsightsBrief } from "./components/ChitInsightsBrief.jsx";
import { AnomalyReviewCard } from "../intelligence/AnomalyReviewCard.jsx";
import { buildAnomalyReview } from "../intelligence/anomalyReview.js";
import { today } from "../finance/model/loanState.js";
import {
  CHIT_TYPES,
  fixedCommissionFromPercent,
  fixedCommissionPercentFromAmount,
  normalizeFixedCommissionAmount,
  validateFixedChit,
} from "./model/fixedChit";
import { validatePredefinedBidChit } from "./model/predefinedBidChit";
import { roundMoney } from "./model/calculations";
import { money, emptySchemeForm, groupRowsBySchemeId } from "./model/chitFormat.js";
import { latestInRangeCycle } from "./model/liveBidding.js";
import { Button, Spinner } from "../../components/ui.jsx";
import { ChitActivateSchemeModal } from "./components/ChitAdminControls.jsx";
import { ChitSchemeForm, ChitTypeChooser, FixedChitSchemeForm, PredefinedBidSchemeForm } from "./components/ChitSchemeForms.jsx";
import { ChitSchemeDetails, ChitSchemeDashboardSection, ChitLandingReports } from "./components/ChitSchemeDashboard.jsx";

// Every view is a URL (see app/AppRoutes.jsx): the landing tab, an open scheme with its tab, and a member's page.
const LANDING_TABS = [["schemes", "Schemes"], ["members", "Members"], ["bids", "Bids"], ["payments", "Payments"], ["reports", "Reports"]];

export function ChitFundPage({ token, tab: routeTab = "schemes", schemeId = null, schemeTab = "overview", memberId = null, onNavigate, onSchemesChanged, orgSettings = {}, workspace = {}, onLogReceipt }) {
  const [schemes, setSchemes] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [fixedLifts, setFixedLifts] = useState([]);
  const [predefinedSchedule, setPredefinedSchedule] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null);
  const [schemeForm, setSchemeForm] = useState(emptySchemeForm);
  const [enriching, setEnriching] = useState(false);
  const [activateTarget, setActivateTarget] = useState(null);
  const [activateBusy, setActivateBusy] = useState(false);
  const [activateError, setActivateError] = useState("");
  const [receiptSuccess, setReceiptSuccess] = useState(null);
  const [reminderRefresh, setReminderRefresh] = useState(0);
  const landing = LANDING_TABS.some(([id]) => id === routeTab) ? routeTab : "schemes";
  const setLanding = next => onNavigate?.({ tab: next });
  const selected = schemeId ? schemes.find(scheme => scheme.id === schemeId) || null : null;
  const setSelected = scheme => onNavigate?.(scheme ? { schemeId: scheme.id } : { tab: landing });
  const applyDashboard = payload => {
    setSchemes(payload.schemes);
    setCycles(payload.cycles);
    setEnrollments(payload.enrollments);
    setFixedLifts(payload.fixedLifts || []);
    setPredefinedSchedule(payload.predefinedSchedule || []);
    setError("");
    onSchemesChanged?.(payload.schemes || []);
  };
  const refresh = async ({ force = true } = {}) => {
    if (force) invalidateChitDashboardCache();
    setBusy(true);
    setEnriching(false);
    try {
      const payload = await loadChitDashboard(token, { force });
      applyDashboard(payload);
    } catch (err) {
      setError(err.message || "Could not load Chit Fund schemes.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setBusy(true);
      setEnriching(false);
      setError("");
      const cached = await loadChitDashboard(token).catch(() => null);
      if (!ignore && cached) {
        applyDashboard(cached);
        setBusy(false);
        return;
      }
      try {
        const schemes = await loadChitSchemes(token);
        if (ignore) return;
        setSchemes(schemes);
        setBusy(false);
        setEnriching(true);
        const related = await loadChitBoardRelated(token);
        if (ignore) return;
        const payload = { schemes, ...related };
        seedChitDashboardCache(token, payload);
        setCycles(related.cycles);
        setEnrollments(related.enrollments);
        setFixedLifts(related.fixedLifts);
        setPredefinedSchedule(related.predefinedSchedule);
        onSchemesChanged?.(schemes);
      } catch (err) {
        if (!ignore) setError(err.message || "Could not load Chit Fund schemes.");
      } finally {
        if (!ignore) {
          setBusy(false);
          setEnriching(false);
        }
      }
    };
    load();
    return () => { ignore = true; };
  }, [token]);
  const rows = useMemo(() => {
    const cyclesByScheme = groupRowsBySchemeId(cycles);
    const enrollmentsByScheme = groupRowsBySchemeId(enrollments);
    const fixedLiftsByScheme = groupRowsBySchemeId(fixedLifts);
    const predefinedByScheme = groupRowsBySchemeId(predefinedSchedule);
    return schemes.map(scheme => {
      const schemeCycles = [...(cyclesByScheme.get(scheme.id) || [])].sort((a, b) => a.cycle_number - b.cycle_number);
      const current = latestInRangeCycle(schemeCycles, scheme.duration_months);
      const members = enrollmentsByScheme.get(scheme.id) || [];
      const winner = members.find(item => item.id === current?.winning_enrollment_id);
      const schemeFixedLifts = fixedLiftsByScheme.get(scheme.id) || [];
      const fixedCurrent = schemeFixedLifts.find(item => item.status === "pending") || schemeFixedLifts.at(-1);
      const fixedWinner = members.find(item => item.id === fixedCurrent?.enrollment_id);
      const schemePredefined = predefinedByScheme.get(scheme.id) || [];
      const predefinedCurrent = schemePredefined.find(item => item.status === "pending") || schemePredefined.at(-1);
      const predefinedWinner = members.find(item => item.id === predefinedCurrent?.enrollment_id);
      return { scheme, current, members, winner, fixedCurrent, fixedWinner, predefinedCurrent, predefinedWinner };
    });
  }, [schemes, cycles, enrollments, fixedLifts, predefinedSchedule]);
  const submitScheme = async event => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      if (schemeForm.chitType === CHIT_TYPES.FIXED_PREDEFINED_BID) {
        validatePredefinedBidChit({
          chitValue: Number(schemeForm.chitValue), memberCount: Number(schemeForm.memberCount),
          durationMonths: Number(schemeForm.durationMonths), startingEmi: Number(schemeForm.predefinedStartingEmi),
          emiIncrement: Number(schemeForm.predefinedEmiIncrement), startingComm: Number(schemeForm.predefinedStartingComm),
          commDecrement: Number(schemeForm.predefinedCommDecrement),
          startingAuctionAmount: Number(schemeForm.predefinedStartingAuctionAmount),
          auctionAmountDecrement: Number(schemeForm.predefinedAuctionDecrement),
          startingBidAmount: Number(schemeForm.predefinedStartingBidAmount),
          bidAmountIncrement: Number(schemeForm.predefinedBidIncrement),
          managerCommissionPercent: Number(schemeForm.predefinedManagerCommissionPercent),
        });
        await createPredefinedBidChitScheme(token, schemeForm);
      } else if (schemeForm.chitType === CHIT_TYPES.FIXED) {
        const commissionAmount = fixedCommissionFromPercent(schemeForm.chitValue, schemeForm.commissionPercent);
        const fixedForm = {
          ...schemeForm,
          fixedCommissionAmount: commissionAmount,
          fixedInitialLiftAmount: schemeForm.fixedInitialLiftAmount === ""
            ? roundMoney(Number(schemeForm.chitValue) - commissionAmount)
            : schemeForm.fixedInitialLiftAmount,
        };
        validateFixedChit({
          chitValue: fixedForm.chitValue, memberCount: Number(fixedForm.memberCount),
          durationMonths: Number(fixedForm.durationMonths), monthlyContribution: fixedForm.installmentAmount,
          commissionPercent: schemeForm.commissionPercent,
          commissionAmount,
          initialLiftAmount: fixedForm.fixedInitialLiftAmount,
          monthlyLiftIncrement: fixedForm.fixedMonthlyIncrement,
        });
        if (modal === "edit-scheme") await updateFixedChitScheme(token, fixedForm);
        else await createFixedChitScheme(token, fixedForm);
      } else if (modal === "edit-scheme") await updateChitScheme(token, schemeForm);
      else await createChitScheme(token, schemeForm);
      setNotice(modal === "edit-scheme" ? "Scheme updated." : "Scheme created as Draft.");
      setModal(null); setSchemeForm(emptySchemeForm()); await refresh();
    } catch (err) { setError(err.message || "Could not save scheme."); }
    finally { setBusy(false); }
  };
  const requestActivate = (scheme, memberCount) => {
    setActivateError("");
    setActivateTarget({ scheme, memberCount });
  };
  const confirmActivate = async () => {
    if (!activateTarget) return;
    setActivateBusy(true); setActivateError("");
    try {
      await activateChitScheme(token, activateTarget.scheme.id);
      setNotice("Scheme activated.");
      setActivateTarget(null);
      await refresh();
    } catch (err) {
      setActivateError(err.message || "Could not activate scheme.");
    } finally {
      setActivateBusy(false);
    }
  };
  // While creating, the type can be switched in the form: the details every type shares are kept, type-specific fields start fresh.
  const changeSchemeType = modal === "scheme" ? type => setSchemeForm(current => ({ ...emptySchemeForm(type), name: current.name, startDate: current.startDate, chitValue: current.chitValue, durationMonths: current.durationMonths, memberCount: current.memberCount })) : undefined;
  const editScheme = scheme => {
    setSchemeForm({
      id: scheme.id, chitType: scheme.chit_type || CHIT_TYPES.AUCTION, name: scheme.name, chitValue: scheme.chit_value, durationMonths: scheme.duration_months,
      memberCount: scheme.member_count, installmentAmount: scheme.installment_amount,
      commissionPercent: scheme.chit_type === CHIT_TYPES.FIXED
        ? (Number(scheme.commission_percent) > 0
          ? String(scheme.commission_percent)
          : fixedCommissionPercentFromAmount(
            scheme.chit_value,
            normalizeFixedCommissionAmount(scheme.chit_value, scheme.fixed_commission_amount),
          ))
        : scheme.commission_percent,
      startDate: scheme.start_date, minBidPercent: scheme.min_bid_percent, maxBidPercent: scheme.max_bid_percent,
      latePenaltyAmount: scheme.late_penalty_amount, securityDepositAmount: scheme.security_deposit_amount,
      fixedCommissionAmount: scheme.fixed_commission_amount ?? "",
      fixedInitialLiftAmount: scheme.fixed_initial_lift_amount ?? "",
      fixedMonthlyIncrement: scheme.fixed_monthly_increment ?? "",
    });
    setModal("edit-scheme");
  };
  const schemeDeleted = async scheme => {
    onNavigate?.({ tab: "schemes" });
    setNotice(`${scheme.name} was deleted.`);
    await refresh();
  };
  // An open scheme waits for the scheme list; an unknown id falls back to the landing page.
  if (schemeId && !selected && busy) return <main className="shell chit-fund-page"><Spinner label="Loading scheme" /></main>;
  if (selected) return <><ChitSchemeDetails key={selected.id} token={token} scheme={selected} tab={schemeTab} onTabChange={next => onNavigate?.({ schemeId: selected.id, schemeTab: next })} memberId={memberId} onMemberChange={id => onNavigate?.({ schemeId: selected.id, schemeTab: "members", memberId: id })} back={() => { onNavigate?.({ tab: "schemes" }); setReminderRefresh(current => current + 1); }} onSchemeDeleted={schemeDeleted} orgSettings={orgSettings} workspace={workspace} onReceipt={setReceiptSuccess} onLogReceipt={onLogReceipt} />{receiptSuccess && <ReceiptSuccessModal receipt={receiptSuccess} settings={orgSettings} token={token} onLogAction={onLogReceipt} close={() => setReceiptSuccess(null)} />}</>;
  return <main className="shell chit-fund-page">
    <div className="toolbar"><div><p className="page-company-name">{workspace?.businessName || "My Finance Business"}</p><h1 className="title">Chit Fund</h1><p className="copy chit-fund-intro">Auction Chits use live bidding, Fixed Chits use scheduled lifts, and Fixed Predefined Bid Chits use an editable generated schedule.</p></div><Button className="primary" onClick={() => setModal("choose-type")}>+ New scheme</Button></div>
    <TabScroller><nav className="module-section-nav" aria-label="Chit Fund sections">
      {LANDING_TABS.map(([id, label]) => (
        <button key={id} type="button" className={`module-section-tab ${landing === id ? "active" : ""}`} aria-current={landing === id ? "page" : undefined} onClick={() => setLanding(id)}>{label}</button>
      ))}
    </nav></TabScroller>
    <Toasts items={[{ id: "error", tone: "error", message: error, onClose: () => setError("") }, { id: "notice", message: notice, onClose: () => setNotice("") }]} />
    {(landing === "schemes" || landing === "payments") && <UpcomingPaymentsSection moduleType="chit" loans={[]} token={token} settings={orgSettings} workspace={workspace} isOwner={workspace?.role !== "staff"} refreshKey={reminderRefresh} />}
    {landing === "schemes" && <ChitInsightsBrief schemes={schemes} enrollments={enrollments} cycles={cycles} fixedLifts={fixedLifts} predefinedSchedule={predefinedSchedule} token={token} onViewMembers={() => setLanding("members")} />}
    {landing === "schemes" && <AnomalyReviewCard review={buildAnomalyReview({ today: today(), schemes, cycles })} onNavigate={() => setLanding("bids")} />}
    {busy && !schemes.length && <Spinner label="Loading Chit Fund schemes" />}
    {enriching && !!schemes.length && landing === "schemes" && <p className="small spacer ft-loading-note"><Spinner size="sm" label="Loading" />Updating current bids and member counts</p>}
    {landing === "schemes" && <>
    <ChitSchemeDashboardSection kind="auction" rows={rows.filter(row => (row.scheme.chit_type || CHIT_TYPES.AUCTION) === CHIT_TYPES.AUCTION)} busy={busy} open={setSelected} edit={editScheme} activate={requestActivate} />
    <ChitSchemeDashboardSection kind="fixed" rows={rows.filter(row => row.scheme.chit_type === CHIT_TYPES.FIXED)} busy={busy} open={setSelected} edit={editScheme} activate={requestActivate} />
    <ChitSchemeDashboardSection kind="predefined" rows={rows.filter(row => row.scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID)} busy={busy} open={setSelected} edit={editScheme} activate={requestActivate} />
    </>}
    {landing === "members" && <div className="card"><strong>Members</strong><p className="small">Open a scheme to enroll members, record payments, or run bids. This list is across all schemes.</p><div className="table spacer"><table><thead><tr><th>Scheme</th><th>Ticket</th><th>Member</th><th></th></tr></thead><tbody>{enrollments.map(item => { const scheme = schemes.find(row => row.id === item.scheme_id); return <tr key={item.id}><td>{scheme?.name || "Scheme"}</td><td>{item.ticket_number}</td><td>{item.chit_members?.full_name || "Member"}</td><td><Button onClick={() => setSelected(scheme || null)}>Open scheme</Button></td></tr>; })}{!enrollments.length && <tr><td colSpan="4">No members enrolled yet.</td></tr>}</tbody></table></div></div>}
    {landing === "bids" && <div className="card"><strong>Bids</strong><p className="small">Auction bid history across schemes. Open a scheme to record a monthly bid or start live bidding.</p><div className="table spacer"><table><thead><tr><th>Scheme</th><th>Month</th><th>Bid date</th><th>Winning bid</th></tr></thead><tbody>{cycles.map(cycle => { const scheme = schemes.find(row => row.id === cycle.scheme_id); return <tr key={cycle.id}><td>{scheme?.name || "Scheme"}</td><td>Month {cycle.cycle_number}</td><td>{cycle.cycle_date}</td><td>{money(cycle.winning_bid_amount)}</td></tr>; })}{!cycles.length && <tr><td colSpan="4">No bids recorded yet.</td></tr>}</tbody></table></div></div>}
    {landing === "payments" && <div className="card spacer"><p className="copy">Upcoming Chit Fund dues are listed above. Open a scheme to record a payment, dividend, or prize payout.</p></div>}
    {landing === "reports" && <ChitLandingReports token={token} schemes={schemes} />}
    {modal === "choose-type" && <ChitTypeChooser close={() => setModal(null)} choose={type => { setSchemeForm(emptySchemeForm(type)); setModal("scheme"); }} />}
    {(modal === "scheme" || modal === "edit-scheme") && (schemeForm.chitType === CHIT_TYPES.FIXED_PREDEFINED_BID
      ? <PredefinedBidSchemeForm onChangeType={changeSchemeType} form={schemeForm} setForm={setSchemeForm} busy={busy} error={error} onClose={() => { setModal(null); if (modal !== "edit-scheme") setSchemeForm(emptySchemeForm()); }} onSubmit={submitScheme} />
      : schemeForm.chitType === CHIT_TYPES.FIXED
        ? <FixedChitSchemeForm onChangeType={changeSchemeType} title={modal === "edit-scheme" ? "Edit Fixed Chit scheme" : "Create Fixed Chit scheme"} form={schemeForm} setForm={setSchemeForm} busy={busy} error={error} onClose={() => { setModal(null); if (modal !== "edit-scheme") setSchemeForm(emptySchemeForm()); }} onSubmit={submitScheme} submitLabel={modal === "edit-scheme" ? "Save changes" : "Create draft"} />
        : <ChitSchemeForm onChangeType={changeSchemeType} title={modal === "edit-scheme" ? "Edit Auction Chit scheme" : "Create Auction Chit scheme"} form={schemeForm} setForm={setSchemeForm} busy={busy} error={error} onClose={() => { setModal(null); if (modal !== "edit-scheme") setSchemeForm(emptySchemeForm()); }} onSubmit={submitScheme} submitLabel={modal === "edit-scheme" ? "Save changes" : "Create draft"} />)}
    {activateTarget && <ChitActivateSchemeModal scheme={activateTarget.scheme} memberCount={activateTarget.memberCount} busy={activateBusy} error={activateError} onCancel={() => !activateBusy && setActivateTarget(null)} onConfirm={confirmActivate} />}
  </main>;
}
