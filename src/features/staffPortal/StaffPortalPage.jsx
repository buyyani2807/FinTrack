import { useEffect, useMemo, useRef, useState } from "react";
import { formatIstTime } from "../../lib/dates.js";
import { formatInr } from "../../lib/formatMoney.js";
import { downloadAccountsPdf } from "../accounts/io/accountingExport.js";
import { formatOverviewDate } from "../accounts/accountsFormat.js";
import { LEAVE_TYPES, inclusiveDays, leaveTypeLabel, monthDates, monthLabel, resolveDay } from "../accounts/model/payroll.js";
import { leaveBalance, payslipFileName, payslipPdfRows, punchHours } from "../accounts/model/payrollExtras.js";
import { PayslipView } from "../accounts/sections/payroll/PayrollPanels.jsx";
import "../accounts/payroll.css";
import "./staffPortal.css";

async function call(action, body) {
  const response = await fetch(`/api/staff/${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || "Something went wrong. Try again.");
    error.status = response.status;
    throw error;
  }
  return data;
}

const mapHome = data => ({
  today: data.today,
  month: data.month,
  employee: data.employee || {},
  profile: {
    payType: data.profile?.pay_type || "monthly",
    paidLeaveQuota: Number(data.profile?.paid_leave_quota || 0),
    sickLeaveQuota: Number(data.profile?.sick_leave_quota || 0),
  },
  punch: data.punch ? { inAt: data.punch.in_at || "", outAt: data.punch.out_at || "" } : null,
  days: (data.days || []).map(row => ({ partyId: row.party_id, workDate: row.work_date, status: row.status, hours: Number(row.hours || 0), overtimeHours: Number(row.overtime_hours || 0) })),
  leave: (data.leave || []).map(row => ({ id: row.id, partyId: row.party_id, leaveType: row.leave_type, fromDate: row.from_date, toDate: row.to_date })),
  leaveUsed: (data.leave_used || []).map(row => ({ partyId: row.party_id, leaveType: row.leave_type, days: Number(row.days || 0) })),
  holidays: (data.holidays || []).map(row => ({ date: row.date, name: row.name })),
  punches: (data.punches || []).map(row => ({ workDate: row.work_date, inAt: row.in_at || "", outAt: row.out_at || "" })),
  payslips: (data.payslips || []).map(row => ({ month: row.period_month, payDate: row.pay_date || "", line: row.line || {} })),
  requests: (data.requests || []).map(row => ({ id: row.id, leaveType: row.leave_type, fromDate: row.from_date, toDate: row.to_date, note: row.note || "", status: row.status })),
  advanceOutstanding: Number(data.advance_outstanding || 0),
});

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("This phone cannot share its location.")); return; }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }),
      error => reject(new Error(error.code === 1
        ? "Location is blocked. Allow location for this site in your browser settings, then try again."
        : "Your location could not be found. Step outside or switch on GPS, then try again.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

// A small JPEG is enough to see who punched, and keeps the upload light on mobile data.
function shrink(source, width, height) {
  const scale = Math.min(1, 320 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.6).split(",")[1] || "";
}

function fileToPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { const photo = shrink(image, image.naturalWidth, image.naturalHeight); URL.revokeObjectURL(url); resolve(photo); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo could not be read. Try again.")); };
    image.src = url;
  });
}

function SelfieCapture({ kind, busy, onPhoto, close }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [live, setLive] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stop = () => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; };
    if (!navigator.mediaDevices?.getUserMedia) {
      Promise.resolve().then(() => { if (!cancelled) setFallback(true); });
      return () => { cancelled = true; };
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => null);
      }
      setLive(true);
    }).catch(() => { if (!cancelled) setFallback(true); });
    return () => { cancelled = true; stop(); };
  }, []);

  const snap = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    onPhoto(shrink(video, video.videoWidth, video.videoHeight));
  };
  const pick = async event => {
    const file = event.target.files?.[0];
    if (file) onPhoto(await fileToPhoto(file).catch(() => ""));
  };

  return <div className="stf-sheet" role="dialog" aria-modal="true" aria-label={`Punch ${kind} photo`}>
    <div className="stf-sheet-card">
      <h2>Punch {kind}</h2>
      <p>Take a photo of your face. Your location is recorded with it.</p>
      {fallback
        ? <label className="btn primary stf-wide">Open camera<input type="file" accept="image/*" capture="user" hidden onChange={pick} disabled={busy} /></label>
        : <>
          <video ref={videoRef} className="stf-video" playsInline muted />
          <button type="button" className="btn primary stf-wide" disabled={!live || busy} onClick={snap}>{busy ? "Sending…" : `Take photo and punch ${kind}`}</button>
        </>}
      <button type="button" className="btn stf-wide" disabled={busy} onClick={close}>Cancel</button>
    </div>
  </div>;
}

const STATUS_LABEL = { present: "P", half: "½", absent: "A", week_off: "Off", holiday: "H", leave: "L" };

export function StaffPortalPage() {
  const [state, setState] = useState("loading");
  const [home, setHome] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState({ staffId: "", pin: "" });
  const [capture, setCapture] = useState(null);
  const [slip, setSlip] = useState(null);
  const [leaveForm, setLeaveForm] = useState({ leaveType: "paid", fromDate: "", toDate: "", note: "" });
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      setHome(mapHome(await call("home")));
      setState("in");
    } catch (err) {
      if (err.status === 401) setState("out");
      else { setError(err.message); setState(current => (current === "loading" ? "out" : current)); }
    }
  };

  useEffect(() => {
    let cancelled = false;
    call("home").then(data => {
      if (cancelled) return;
      setHome(mapHome(data));
      setState("in");
    }).catch(err => {
      if (cancelled) return;
      if (err.status !== 401) setError(err.message);
      setState("out");
    });
    return () => { cancelled = true; };
  }, []);

  const run = async work => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      return true;
    } catch (err) {
      if (err.status === 401) { setHome(null); setState("out"); }
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const signIn = event => {
    event.preventDefault();
    run(async () => {
      await call("login", { staffId: login.staffId.trim().toUpperCase(), pin: login.pin.trim() });
      setLogin({ staffId: "", pin: "" });
      await load();
    });
  };
  const signOut = () => run(async () => { await call("logout"); setHome(null); setState("out"); });

  const punch = async photo => {
    const kind = capture;
    if (!photo) { setError("That photo could not be read. Try again."); return; }
    const done = await run(async () => {
      const place = await locate();
      await call("punch", { kind, photo, ...place });
      await load();
    });
    setCapture(null);
    if (done) setNotice(kind === "in" ? "Punched in. Have a good day." : "Punched out.");
  };

  const askLeave = event => {
    event.preventDefault();
    run(async () => {
      await call("leave", leaveForm);
      setLeaveForm({ leaveType: "paid", fromDate: "", toDate: "", note: "" });
      await load();
      setNotice("Leave request sent.");
    });
  };

  const partyId = home?.employee?.party_id || "";
  const calendar = useMemo(() => {
    if (!home) return [];
    return monthDates(home.month).map(day => {
      const resolved = resolveDay({ partyId, date: day.date, weekday: day.weekday, days: home.days, leaves: home.leave, holidays: home.holidays });
      return { ...day, status: resolved.status, future: day.date > home.today };
    });
  }, [home, partyId]);
  const tally = useMemo(() => {
    const counts = { present: 0, half: 0, absent: 0, leave: 0 };
    for (const day of calendar) if (!day.future && counts[day.status] !== undefined) counts[day.status] += 1;
    return counts;
  }, [calendar]);
  const balance = home ? leaveBalance({ profile: home.profile, used: home.leaveUsed, partyId }) : null;

  if (state === "loading") return <main className="stf-page"><p className="stf-muted" role="status">Loading…</p></main>;

  if (state === "out") {
    return <main className="stf-page">
      <form className="stf-card stf-login" onSubmit={signIn}>
        <h1>Staff sign in</h1>
        <p className="stf-muted">Use the Staff ID and PIN your employer gave you.</p>
        {error ? <p className="stf-error" role="alert">{error}</p> : null}
        <label className="field"><span>Staff ID</span>
          <input value={login.staffId} placeholder="ST-1A2B3C4D" autoCapitalize="characters" autoComplete="username" onChange={event => setLogin(current => ({ ...current, staffId: event.target.value }))} />
        </label>
        <label className="field"><span>PIN</span>
          <input type="password" inputMode="numeric" maxLength={6} autoComplete="current-password" value={login.pin} onChange={event => setLogin(current => ({ ...current, pin: event.target.value.replace(/\D/g, "") }))} />
        </label>
        <button type="submit" className="btn primary stf-wide" disabled={busy || !login.staffId.trim() || login.pin.length !== 6}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>;
  }

  const punchedIn = Boolean(home.punch?.inAt);
  const punchedOut = Boolean(home.punch?.outAt);

  return <main className="stf-page">
    <header className="stf-head">
      <div>
        <h1>{home.employee.name}</h1>
        <p className="stf-muted">{home.employee.company} · {home.employee.staff_id}</p>
      </div>
      <button type="button" className="btn" disabled={busy} onClick={signOut}>Sign out</button>
    </header>
    {error ? <p className="stf-error" role="alert">{error}</p> : null}
    {notice ? <p className="stf-ok" role="status">{notice}</p> : null}

    <section className="stf-card">
      <h2>Today · {formatOverviewDate(home.today)}</h2>
      {punchedIn ? <p>In at <strong>{formatIstTime(home.punch.inAt)}</strong>{punchedOut ? <> · Out at <strong>{formatIstTime(home.punch.outAt)}</strong> · {punchHours(home.punch.inAt, home.punch.outAt)} hours</> : null}</p> : <p className="stf-muted">You have not punched in yet.</p>}
      {!punchedIn && <button type="button" className="btn primary stf-wide stf-punch" disabled={busy} onClick={() => { setError(""); setCapture("in"); }}>Punch in</button>}
      {punchedIn && !punchedOut && <button type="button" className="btn primary stf-wide stf-punch" disabled={busy} onClick={() => { setError(""); setCapture("out"); }}>Punch out</button>}
    </section>

    <section className="stf-card">
      <h2>{monthLabel(home.month)}</h2>
      <dl className="stf-tally">
        <div><dt>Present</dt><dd>{tally.present}</dd></div>
        <div><dt>Half days</dt><dd>{tally.half}</dd></div>
        <div><dt>Absent</dt><dd>{tally.absent}</dd></div>
        <div><dt>Leave</dt><dd>{tally.leave}</dd></div>
      </dl>
      <ol className="stf-days" aria-label="Attendance this month">
        {calendar.map(day => <li key={day.date} className={`stf-day is-${day.future ? "future" : day.status}`}>
          <span>{day.day}</span><small>{day.future ? "" : STATUS_LABEL[day.status] || ""}</small>
        </li>)}
      </ol>
      <p className="stf-muted">P present · ½ half day · A absent · L leave · H holiday · Off weekly off. If a day looks wrong, tell your employer.</p>
    </section>

    <section className="stf-card">
      <h2>Payslips</h2>
      {home.payslips.length ? <ul className="stf-list">
        {home.payslips.map(row => <li key={row.month}>
          <button type="button" className="stf-row" onClick={() => setSlip(row)}>
            <span>{monthLabel(row.month)}</span><strong>{formatInr(row.line.net || 0)}</strong>
          </button>
        </li>)}
      </ul> : <p className="stf-muted">Your payslips appear here after each month is paid.</p>}
      {home.advanceOutstanding > 0 && <p className="stf-muted">Advance still to be recovered from salary: {formatInr(home.advanceOutstanding)}.</p>}
    </section>

    <section className="stf-card">
      <h2>Leave</h2>
      {balance && (balance.paid.quota > 0 || balance.sick.quota > 0) ? <dl className="stf-tally">
        {balance.paid.quota > 0 && <div><dt>Paid leave left</dt><dd>{balance.paid.left}</dd></div>}
        {balance.sick.quota > 0 && <div><dt>Sick leave left</dt><dd>{balance.sick.left}</dd></div>}
      </dl> : null}
      <form className="stf-form" onSubmit={askLeave}>
        <label className="field"><span>Type</span>
          <select value={leaveForm.leaveType} onChange={event => setLeaveForm(current => ({ ...current, leaveType: event.target.value }))}>
            {LEAVE_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
        <label className="field"><span>From</span><input type="date" value={leaveForm.fromDate} onChange={event => setLeaveForm(current => ({ ...current, fromDate: event.target.value }))} /></label>
        <label className="field"><span>To</span><input type="date" min={leaveForm.fromDate} value={leaveForm.toDate} onChange={event => setLeaveForm(current => ({ ...current, toDate: event.target.value }))} /></label>
        <label className="field stf-span"><span>Reason</span><input value={leaveForm.note} maxLength={240} onChange={event => setLeaveForm(current => ({ ...current, note: event.target.value }))} /></label>
        <button type="submit" className="btn primary stf-wide stf-span" disabled={busy || !leaveForm.fromDate || !leaveForm.toDate || leaveForm.toDate < leaveForm.fromDate}>Ask for leave</button>
      </form>
      {home.requests.length ? <ul className="stf-list">
        {home.requests.map(row => <li key={row.id} className="stf-row">
          <span>{leaveTypeLabel(row.leaveType)} · {formatOverviewDate(row.fromDate)}{row.toDate !== row.fromDate ? ` to ${formatOverviewDate(row.toDate)}` : ""} · {inclusiveDays(row.fromDate, row.toDate)} {inclusiveDays(row.fromDate, row.toDate) === 1 ? "day" : "days"}</span>
          <strong className={`stf-status is-${row.status}`}>{row.status === "pending" ? "Waiting" : row.status === "approved" ? "Approved" : "Declined"}</strong>
        </li>)}
      </ul> : null}
    </section>

    {capture && <SelfieCapture kind={capture} busy={busy} onPhoto={punch} close={() => !busy && setCapture(null)} />}

    {slip && <div className="stf-sheet" role="dialog" aria-modal="true" aria-label={`Payslip ${monthLabel(slip.month)}`}>
      <div className="stf-sheet-card stf-sheet-slip">
        <PayslipView slip={{ ...slip.line, name: slip.line.name || home.employee.name }} companyName={home.employee.company} monthIso={slip.month} payDate={slip.payDate} />
        <button type="button" className="btn primary stf-wide" onClick={() => downloadAccountsPdf(payslipFileName({ slip: { name: home.employee.name }, month: slip.month }), {
          title: `${home.employee.company || "Company"} - Payslip`,
          subtitle: `${monthLabel(slip.month)} - ${home.employee.name}`,
          rows: payslipPdfRows({ slip: { ...slip.line, name: home.employee.name }, payDate: slip.payDate ? formatOverviewDate(slip.payDate) : "" }),
        })}>Download PDF</button>
        <button type="button" className="btn stf-wide" onClick={() => setSlip(null)}>Close</button>
      </div>
    </div>}
  </main>;
}
