import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { createFinanceAccount, customerPortalLogin, deleteFinanceAccount, enableCustomerPortal, loadCustomerKyc, loadFinanceAccounts, loadWorkspace, recordPayment, resetCustomerPortalPin, saveCustomerKyc, updateFinanceAccount } from "./lib/financeRepository";

// FinTrack MVP. This browser-only build is for testing; add a secure backend,
// authentication, audit trails, and local compliance review before production.
const C = {
  bg: "#0e1118",
  surface: "#171c27",
  card: "#202737",
  line: "#303a4d",
  text: "#f4f6fb",
  muted: "#9ba9bd",
  gold: "#f4b942",
  green: "#4fd08d",
  red: "#ff7373",
  blue: "#72aaff"
};
const today = () => new Date().toISOString().slice(0, 10);
const money = n => `₹${Number(n || 0).toLocaleString("en-IN", {
  maximumFractionDigits: 0
})}`;
const addDays = (s, n) => {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonths = (s, n) => {
  const d = new Date(`${s}T12:00:00`),
    day = d.getDate();
  d.setMonth(d.getMonth() + n, 1);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
};
const elapsedDays = (s, e = today()) => Math.max(0, Math.floor((new Date(`${e}T12:00:00`) - new Date(`${s}T12:00:00`)) / 86400000));
const annualRate = (loan, date) => Number([...loan.rateChanges].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).filter(r => r.effectiveDate <= date).at(-1)?.annualRate || loan.annualRate || 0);
const txTotal = (loan, key) => loan.transactions.reduce((s, t) => s + Number(t[key] || 0), 0);
const dailyPaid = loan => txTotal(loan, "amount");
const dailyBalance = loan => Math.max(0, loan.collectionAmount - dailyPaid(loan));
const monthlyPrincipalPaid = (loan, before) => loan.transactions.filter(t => !before || t.date < before).reduce((s, t) => s + Number(t.principalAmount || 0), 0);
const monthlyBalance = (loan, before) => Math.max(0, loan.principal - monthlyPrincipalPaid(loan, before));
const monthlyInterestPaid = loan => txTotal(loan, "interestAmount");
const monthlyPenaltyPaid = loan => txTotal(loan, "penaltyAmount");
const monthlyDueRows = loan => {
  const rows = [];
  for (let n = 1;; n++) {
    const dueDate = addMonths(loan.startDate, n);
    if (dueDate > today()) break;
    const balance = monthlyBalance(loan, dueDate);
    if (!balance) break;
    rows.push({
      number: n,
      dueDate,
      balance,
      annualRate: annualRate(loan, dueDate),
      interest: Math.round(balance * annualRate(loan, dueDate) / 1200)
    });
  }
  return rows;
};
const monthlyInterestDue = loan => monthlyDueRows(loan).reduce((s, r) => s + r.interest, 0);
const monthlyInterestPending = loan => Math.max(0, monthlyInterestDue(loan) - monthlyInterestPaid(loan));
const missedMonths = loan => {
  let remaining = monthlyInterestPaid(loan);
  return monthlyDueRows(loan).filter(r => {
    remaining -= r.interest;
    return remaining < 0;
  }).length;
};
const estimatedPenalty = loan => Math.round(monthlyInterestPending(loan) * Number(loan.penaltyRate || 0) / 100);
const loanBalance = loan => loan.kind === "daily" ? dailyBalance(loan) : monthlyBalance(loan);
const loanPaid = loan => loan.kind === "daily" ? dailyPaid(loan) : txTotal(loan, "principalAmount") + monthlyInterestPaid(loan) + monthlyPenaltyPaid(loan);
const loanStatus = loan => loanBalance(loan) <= 0 ? "completed" : loan.kind === "daily" ? dailyPaid(loan) < Math.min(100, elapsedDays(loan.startDate)) * loan.dailyCollection ? "overdue" : "active" : monthlyInterestPending(loan) > 0 ? "overdue" : "active";
const sample = [{
  id: "D1001",
  customerId: "C001",
  pin: "0000",
  customerName: "Ramesh Kumar",
  phone: "9876543210",
  address: "Coimbatore",
  kind: "daily",
  startDate: addDays(today(), -22),
  collectionAmount: 10000,
  disbursedAmount: 8500,
  dailyCollection: 100,
  transactions: Array.from({
    length: 18
  }, (_, i) => ({
    id: `D${i}`,
    date: addDays(today(), -18 + i),
    amount: 100,
    mode: i % 2 ? "cash" : "upi",
    ref: ""
  }))
}, {
  id: "M1001",
  customerId: "C002",
  pin: "0000",
  customerName: "Priya Sundaram",
  phone: "9845001234",
  address: "Chennai",
  kind: "monthly",
  startDate: addMonths(today(), -4),
  principal: 100000,
  annualRate: 3,
  penaltyRate: 5,
  rateChanges: [],
  transactions: [{
    id: "M1",
    date: addMonths(today(), -3),
    interestAmount: 3000,
    principalAmount: 0,
    penaltyAmount: 0,
    mode: "upi",
    ref: "UPI-102"
  }, {
    id: "M2",
    date: addMonths(today(), -2),
    interestAmount: 3000,
    principalAmount: 10000,
    penaltyAmount: 0,
    mode: "bank",
    ref: "NEFT-81"
  }, {
    id: "M3",
    date: addMonths(today(), -1),
    interestAmount: 2700,
    principalAmount: 0,
    penaltyAmount: 0,
    mode: "cash",
    ref: ""
  }]
}];
const styles = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@600;700&display=swap');*{box-sizing:border-box}body{margin:0;background:${C.bg};color:${C.text};font-family:DM Sans,system-ui}button,input,select{font:inherit}button{cursor:pointer}.app{min-height:100vh}.shell{max-width:1240px;margin:auto;padding:24px}.top,.row,.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.top{margin-bottom:28px}.brand{font:700 28px Syne;color:${C.gold}}.sub,.small{font-size:12px;color:${C.muted}}.tabs{display:flex;gap:8px;flex-wrap:wrap}.btn{padding:9px 13px;background:transparent;border:1px solid ${C.line};color:${C.text};border-radius:9px;font-weight:600}.btn.primary{background:${C.gold};border-color:${C.gold};color:#211907}.btn.danger{color:${C.red};border-color:#ff737355}.tab.active{color:${C.gold};border-color:${C.gold};background:#f4b94218}.card{padding:18px;background:${C.card};border:1px solid ${C.line};border-radius:14px}.grid{display:grid;gap:14px}.metrics{grid-template-columns:repeat(auto-fit,minmax(155px,1fr));margin:18px 0 22px}.two{grid-template-columns:minmax(0,1.3fr) minmax(300px,.7fr)}.metric-label{font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.08em}.metric-value{font:700 22px Syne;margin-top:8px}.gold{color:${C.gold}}.green{color:${C.green}}.red{color:${C.red}}.blue{color:${C.blue}}.title{font:700 22px Syne;margin:0 0 4px}.copy{margin:0;color:${C.muted};font-size:13px}.field{display:flex;flex-direction:column;gap:6px;flex:1}.field label{font-size:12px;color:${C.muted};font-weight:600}.field input,.field select{border:1px solid ${C.line};border-radius:8px;padding:10px;background:${C.surface};color:${C.text};width:100%}.form{display:grid;grid-template-columns:repeat(2,1fr);gap:13px}.span{grid-column:1/-1}.table{overflow:auto}.table table{border-collapse:collapse;width:100%;font-size:13px}.table th{text-align:left;color:${C.muted};font-size:11px;letter-spacing:.04em}.table td,.table th{padding:11px 9px;border-bottom:1px solid ${C.line};white-space:nowrap}.badge{font-size:10px;border-radius:14px;padding:4px 8px;font-weight:700;text-transform:uppercase}.badge.active{color:${C.blue};background:#72aaff18}.badge.overdue{color:${C.red};background:#ff737318}.badge.completed{color:${C.green};background:#4fd08d18}.notice{font-size:12px;line-height:1.5;background:#f4b94216;color:#f7dc99;border-left:3px solid ${C.gold};padding:10px 12px;border-radius:7px;margin:14px 0}.modal-bg{position:fixed;inset:0;padding:16px;background:#000b;z-index:10;display:flex;align-items:center;justify-content:center}.modal{width:min(720px,100%);max-height:92vh;overflow:auto;padding:22px;background:${C.card};border:1px solid ${C.line};border-radius:16px}.login{max-width:390px;margin:12vh auto}.login .card{padding:28px}.spacer{margin-top:18px}@media(max-width:680px){.shell{padding:16px}.top{align-items:flex-start;flex-direction:column}.two,.form{grid-template-columns:1fr}.span{grid-column:auto}.hide{display:none}}`;
const enhancements = `.financier-nav{position:fixed;z-index:6;left:20px;top:50%;transform:translateY(-50%);width:194px;padding:14px;background:#151b27eF;border:1px solid ${C.line};border-radius:16px;box-shadow:0 20px 50px #0007;backdrop-filter:blur(12px)}.financier-nav .nav-title{font:700 16px Syne;color:${C.gold};padding:6px 8px 15px}.financier-nav button{width:100%;text-align:left;margin:3px 0}.financier-nav .nav-footer{border-top:1px solid ${C.line};margin-top:12px;padding-top:12px;color:${C.muted};font-size:11px}.tool-stack{display:flex;gap:8px;flex-direction:column;align-items:stretch}@media(max-width:1050px){.financier-nav{top:auto;bottom:14px;left:14px;right:14px;transform:none;width:auto;display:flex;gap:8px;padding:9px}.financier-nav .nav-title,.financier-nav .nav-footer{display:none}.financier-nav button{margin:0;text-align:center;font-size:12px}.financier-nav button:last-of-type{display:none}}`;
const homeReportHide = `.shell > .toolbar > .tabs > .field,.shell > .toolbar > .tabs > .field + .btn{display:none}`;
const visualRefresh = `
:root{font:16px/1.45 DM Sans,system-ui,sans-serif!important;color-scheme:dark!important;background:#0e1118!important}#root{width:100%!important;max-width:none!important;min-height:100svh!important;margin:0!important;border:0!important;display:block!important;text-align:left!important}.app{min-height:100svh;background:radial-gradient(700px 480px at 4% -10%,#202b41 0%,transparent 65%),#0e1118;color:#f4f6fb}.shell{max-width:1420px;padding:36px 44px 74px}.top{margin-bottom:34px}.brand{font-family:Syne,DM Sans,sans-serif;font-size:27px;letter-spacing:-.8px;color:#f4b942}.sub{margin-top:6px;color:#9ba9bd;font-size:12px;letter-spacing:.02em}.title{font-family:Syne,DM Sans,sans-serif;font-size:28px;letter-spacing:-.7px;color:#f4f6fb!important}.shell .title,.shell .title *{color:#f4f6fb!important}.copy{color:#9ba9bd;font-size:13px}.toolbar{gap:18px}.tabs{gap:7px}.btn{min-height:38px;padding:8px 13px;border:1px solid #303a4d;background:#171c27;color:#f4f6fb;border-radius:10px;font-size:13px;font-weight:700;transition:background .18s,border-color .18s,transform .18s,box-shadow .18s}.btn:hover{transform:translateY(-1px);background:#242c3b;border-color:#4a586f;box-shadow:0 6px 16px #0005}.btn:focus-visible{outline:3px solid #f4b94255;outline-offset:2px}.btn.primary{background:#f4b942;color:#211907;border-color:#f4b942;box-shadow:0 6px 14px #0004}.btn.primary:hover{background:#ffd062;border-color:#ffd062}.btn.danger{border-color:#ff737355;color:#ff9898;background:#3c1b221f}.btn.danger:hover{background:#492027}.tab{background:transparent;color:#9ba9bd;border-color:transparent;box-shadow:none}.tab:hover{background:#ffffff0c;border-color:transparent}.tab.active{background:#f4b94218;color:#f4b942;border-color:#f4b94270;box-shadow:none}.card{background:#202737;border:1px solid #303a4d;border-radius:16px;box-shadow:0 8px 24px #0003}.card:hover{border-color:#46536a}.metrics{gap:16px;margin:22px 0 26px}.metrics .card{position:relative;overflow:hidden;padding:18px 19px;background:linear-gradient(145deg,#222c3e,#1b2230)}.metrics .card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#f4b942}.metric-label{font-size:10px;font-weight:700;color:#9ba9bd;letter-spacing:.09em}.metric-value{font-family:Syne,DM Sans,sans-serif;font-size:24px;letter-spacing:-.65px;margin-top:9px}.gold{color:#f4b942}.green{color:#4fd08d}.red{color:#ff7373}.blue{color:#72aaff}.field{gap:7px}.field label{font-size:11px;letter-spacing:.035em;color:#aab7ca}.field input,.field select{min-height:41px;padding:9px 11px;border-radius:10px;border-color:#303a4d;background:#171c27;color:#f4f6fb;outline:none;transition:border-color .15s,box-shadow .15s}.field input:focus,.field select:focus{border-color:#f4b942;box-shadow:0 0 0 3px #f4b9421c}.table{border:1px solid #303a4d;border-radius:12px}.table table{font-size:13px}.table th{padding:12px 13px;background:#171c27;color:#9ba9bd;font-size:10px;letter-spacing:.08em}.table td{padding:13px;border-color:#303a4d;color:#e4e9f2}.table tbody tr{transition:background .15s}.table tbody tr:hover{background:#ffffff08}.badge{padding:5px 9px;border-radius:999px;font-size:9px;letter-spacing:.06em}.notice{border:1px solid #f4b94255;border-left:3px solid #f4b942;background:#f4b94216;color:#f7dc99;border-radius:10px;padding:11px 13px}.modal-bg{padding:24px;background:#000b;backdrop-filter:blur(5px)}.modal{width:min(760px,100%);padding:28px;border-radius:19px;background:#202737;border-color:#46536a;box-shadow:0 25px 80px #000a}.login{max-width:450px;margin:10vh auto}.login>.brand{font-size:34px;color:#f4b942;text-align:center}.login>.sub{font-size:13px;text-align:center}.login .card{padding:26px;background:#202737;border-color:#3c475c;box-shadow:0 22px 70px #0008}.login .tabs{display:grid;grid-template-columns:1fr 1fr}.login .tabs .btn:last-child{grid-column:1/-1}.login .tab{min-height:42px;border:1px solid #303a4d}.login .tab.active{border-color:#f4b94270}.financier-nav{background:#202737!important;border-color:#3a465a!important;border-radius:16px!important;box-shadow:0 12px 34px #0008!important}.financier-nav .nav-title{color:#f4b942!important;font-family:Syne,DM Sans,sans-serif!important}.financier-nav button{border-color:transparent!important}.financier-nav button.tab.active{background:#f4b94218!important;border-color:#f4b94270!important}.financier-nav .nav-footer{color:#9ba9bd!important;border-color:#303a4d!important}.customer-actions{right:28px!important;bottom:auto!important;top:20px!important;background:#202737!important;padding:8px!important;border:1px solid #3a465a!important;border-radius:14px!important;box-shadow:0 12px 30px #0008!important}@media(min-width:1051px){.shell{margin-left:240px;max-width:calc(1420px + 240px)}.financier-nav{left:24px!important;top:28px!important;transform:none!important;width:192px!important}}@media(max-width:1050px){.shell{padding:28px 24px 86px}.financier-nav{background:#202737f2!important}}@media(max-width:680px){.shell{padding:22px 16px 98px}.top,.toolbar{align-items:flex-start}.toolbar{flex-direction:column}.title{font-size:24px}.metrics{grid-template-columns:1fr 1fr}.metrics .card{padding:15px}.metric-value{font-size:20px}.login{margin:5vh 16px}.modal{padding:21px}.customer-actions{top:auto!important;bottom:12px!important;left:12px!important;right:12px!important}.customer-actions .tabs{justify-content:center}.form{gap:11px}}`;
const mobileCollections = `.customer-search,.collection-search{display:flex;gap:8px;align-items:center;margin:14px 0}.customer-search input,.collection-search input{width:min(460px,100%);min-height:42px;padding:10px 12px;border:1px solid #303a4d;border-radius:10px;background:#171c27;color:#f4f6fb;outline:none}.customer-search input:focus,.collection-search input:focus{border-color:#f4b942;box-shadow:0 0 0 3px #f4b9421c}.collection-shell{max-width:970px}.collection-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.collection-summary>div{padding:15px 17px;border-radius:14px;background:#202737;border:1px solid #303a4d}.collection-summary span,.collection-amount span{display:block;color:#9ba9bd;font-size:11px;text-transform:uppercase;letter-spacing:.07em}.collection-summary strong{display:block;margin-top:7px;font:700 22px Syne}.collection-section{margin-top:28px}.collection-section h2{font:700 18px Syne;margin:0 0 6px;color:#f4f6fb}.collection-section h2 span{font:600 11px DM Sans;color:#9ba9bd;margin-left:7px;letter-spacing:.04em;text-transform:uppercase}.collection-list{display:grid;gap:10px;margin-top:12px}.collection-card{display:grid;grid-template-columns:46px minmax(160px,1fr) 130px auto;gap:14px;align-items:center;padding:15px;background:#202737;border:1px solid #303a4d;border-radius:15px}.monthly-card{border-left:3px solid #72aaff}.daily-card{border-left:3px solid #f4b942}.collection-card.collected{opacity:.72;border-color:#4fd08d55}.collection-avatar{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:#72aaff1c;color:#72aaff;font-weight:800}.collection-info{display:grid;gap:2px}.collection-info strong{font-size:15px}.collection-info span,.collection-amount small{font-size:12px;color:#9ba9bd}.collection-amount{text-align:right}.collection-amount strong{display:block;margin:3px 0;font-size:16px}.collection-actions{display:flex;gap:7px}@media(max-width:680px){.collection-shell{margin-left:0!important;padding-bottom:28px}.customer-search,.collection-search{width:100%}.customer-search input,.collection-search input{flex:1}.collection-summary{grid-template-columns:1fr 1fr}.collection-summary>div:last-child{grid-column:1/-1}.collection-card{grid-template-columns:42px 1fr auto;gap:10px;padding:13px}.collection-avatar{width:42px;height:42px}.collection-info span:last-child{display:none}.collection-amount{grid-column:2;text-align:left}.collection-actions{grid-column:3;grid-row:1 / span 2;flex-direction:column}.collection-actions .btn{min-width:74px}.collection-actions .btn:first-child{display:none}}`;
const Button = ({
  children,
  className = "",
  ...props
}) => <button className={`btn ${className}`} {...props}>{children}</button>;
const Field = ({
  label,
  children,
  className = ""
}) => <div className={`field ${className}`}><label>{label}</label>{children}</div>;
const Metric = ({
  label,
  value,
  color = ""
}) => <div className="card"><div className="metric-label">{label}</div><div className={`metric-value ${color}`}>{value}</div></div>;
const Badge = ({
  status
}) => <span className={`badge ${status}`}>{status}</span>;
function FinancierAuth({ onLogin, onCustomerLogin }) {
  const [mode, setMode] = useState("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [portalId, setPortalId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const signInAndEnter = async () => {
    const result = await supabase.auth.signIn(email, password);
    onLogin({ role: "financier", authToken: result.access_token });
  };
  const submit = async () => {
    setMessage(""); setBusy(true);
    try {
      if (mode === "customer") {
        if (!portalId || !password) throw new Error("Enter your portal ID and PIN.");
        onCustomerLogin(await customerPortalLogin(portalId, password));
      } else if (mode === "signUp") {
        if (!businessName || !fullName) throw new Error("Enter your business name and your name.");
        const result = await supabase.auth.signUp(email, password);
        const workspace = { workspace_name: businessName, display_name: fullName };
        if (!result.access_token) {
          throw new Error("Your account could not be signed in automatically. In Supabase, turn off Confirm email under Authentication → Providers → Email, then try again.");
        }
        await supabase.rpc("provision_financier", workspace, result.access_token);
        onLogin({ role: "financier", authToken: result.access_token, name: fullName });
      } else {
        await signInAndEnter();
      }
    } catch (error) { setMessage(error.message || "Unable to sign in."); }
    finally { setBusy(false); }
  };
  const isCustomer = mode === "customer";
  return <div className="login"><div className="brand" style={{ textAlign: "center" }}>FinTrack</div><p className="sub" style={{ textAlign: "center", marginBottom: 22 }}>{isCustomer ? "View your finance balance and payment history" : "Secure workspace for finance businesses"}</p><div className="card"><div className="tabs" style={{ marginBottom: 18 }}><Button className={`tab ${mode === "signIn" ? "active" : ""}`} onClick={() => setMode("signIn")}>Financier sign in</Button><Button className={`tab ${mode === "customer" ? "active" : ""}`} onClick={() => setMode("customer")}>Customer login</Button><Button className={`tab ${mode === "signUp" ? "active" : ""}`} onClick={() => setMode("signUp")}>Create business account</Button></div>{isCustomer ? <><Field label="Customer portal ID"><input placeholder="e.g. FT-1A2B3C4D" value={portalId} onChange={event => setPortalId(event.target.value.toUpperCase())} /></Field><div className="spacer"><Field label="6-digit PIN"><input type="password" inputMode="numeric" minLength="6" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></Field></div></> : <>{mode === "signUp" && <><Field label="Business name"><input placeholder="e.g. Vivek Finance" value={businessName} onChange={event => setBusinessName(event.target.value)} /></Field><div className="spacer"><Field label="Your full name"><input value={fullName} onChange={event => setFullName(event.target.value)} /></Field></div></>}<div className="spacer"><Field label="Business email"><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></Field></div><div className="spacer"><Field label="Password"><input type="password" minLength="8" autoComplete={mode === "signIn" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} /></Field></div></>}{message && <p className="small" style={{ color: message.includes("created") ? C.green : C.red }}>{message}</p>}<Button className="primary spacer" style={{ width: "100%" }} disabled={busy} onClick={submit}>{busy ? "Please wait…" : isCustomer ? "Open my dashboard" : mode === "signIn" ? "Sign in" : "Create business account"}</Button></div></div>;
}
const csvCell = value => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const downloadCsv = (filename, rows) => {
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
const paymentValue = (loan, transaction) => loan.kind === "daily" ? Number(transaction.amount || 0) : Number(transaction.interestAmount || 0) + Number(transaction.principalAmount || 0) + Number(transaction.penaltyAmount || 0);
const downloadDailyReport = (loans, reportDate) => {
  const payments = loans.flatMap(loan => loan.transactions.filter(transaction => transaction.date === reportDate).map(transaction => [loan.id, loan.customerName, loan.phone, loan.kind, transaction.date, paymentValue(loan, transaction), transaction.mode, transaction.ref || "", transaction.notes || ""]));
  const total = payments.reduce((sum, row) => sum + Number(row[5]), 0);
  downloadCsv(`fintrack-daily-report-${reportDate}.csv`, [["FinTrack Daily Collection Report"], ["Report date", reportDate], ["Total collected", total], [], ["Finance ID", "Customer", "Phone", "Finance type", "Payment date", "Amount", "Mode", "Reference", "Notes"], ...payments, [], ["Total", "", "", "", "", total]]);
};
const downloadCustomerReport = loan => {
  const monthly = loan.kind === "monthly";
  const rows = [...loan.transactions].sort((a, b) => a.date.localeCompare(b.date)).map(transaction => [transaction.date, monthly ? transaction.interestAmount || 0 : "", monthly ? transaction.principalAmount || 0 : "", monthly ? transaction.penaltyAmount || 0 : "", paymentValue(loan, transaction), transaction.mode, transaction.ref || "", transaction.notes || ""]);
  downloadCsv(`fintrack-payment-history-${loan.id}.csv`, [["FinTrack Customer Payment Report"], ["Customer", loan.customerName], ["Finance ID", loan.id], ["Finance type", loan.kind], [monthly ? "Principal taken" : "Amount paid to customer", monthly ? loan.principal : loan.disbursedAmount], [monthly ? "Principal remaining" : "Collection balance", loanBalance(loan)], ["Total paid", loanPaid(loan)], [], ["Date", "Interest paid", "Principal repaid", "Penalty paid", "Total paid", "Mode", "Reference", "Notes"], ...rows]);
};
function Login({
  loans,
  onLogin,
  adminPin
}) {
  const [role, setRole] = useState("financier"),
    [id, setId] = useState(""),
    [pin, setPin] = useState(""),
    [error, setError] = useState("");
  const enter = () => {
    if (role === "financier") {
      if (pin === adminPin) onLogin({
        role: "financier"
      });else setError("Incorrect financier PIN.");
    } else {
      const loan = loans.find(l => l.id.toUpperCase() === id.toUpperCase() && l.pin === pin);
      loan ? onLogin({
        role: "customer",
        loanId: loan.id
      }) : setError("Check the finance ID and PIN. Demo customer PIN is 0000.");
    }
  };
  return <div className="login"><div className="brand" style={{
      textAlign: "center"
    }}>FinTrack</div><p className="sub" style={{
      textAlign: "center",
      marginBottom: 22
    }}>Daily & monthly finance collections</p><div className="card"><div className="tabs" style={{
        marginBottom: 18
      }}><Button className={`tab ${role === "financier" ? "active" : ""}`} onClick={() => setRole("financier")}>Financier</Button><Button className={`tab ${role === "customer" ? "active" : ""}`} onClick={() => setRole("customer")}>Customer</Button></div>{role === "customer" && <Field label="Finance ID"><input placeholder="e.g. M1001" value={id} onChange={e => setId(e.target.value)} /></Field>}<div className="spacer"><Field label="PIN"><input type="password" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && enter()} /></Field></div>{error && <p className="red small">{error}</p>}<Button className="primary spacer" style={{
        width: "100%"
      }} onClick={enter}>Sign in</Button><p className="small" style={{
        marginTop: 16
      }}>Demo: financier PIN 1234 · customer IDs D1001 / M1001, PIN 0000</p></div></div>;
}
function NewFinance({
  close,
  save
}) {
  const [f, setF] = useState({
    kind: "daily",
    customerName: "",
    phone: "",
    address: "",
    aadhaar: "",
    pan: "",
    startDate: today(),
    collectionAmount: "10000",
    disbursedAmount: "8500",
    principal: "100000",
    annualRate: "3",
    penaltyRate: "5"
  });
  const [err, setErr] = useState("");
  const set = (k, v) => setF(x => ({
    ...x,
    [k]: v
  }));
  const submit = async () => {
    if (!f.customerName || !f.phone || f.kind === "daily" && !f.collectionAmount || f.kind === "monthly" && !f.principal) return setErr("Complete the customer details and amount.");
    const stamp = Date.now().toString().slice(-6),
      daily = f.kind === "daily";
    try {
      await save({
      ...f,
      aadhaar: f.aadhaar.trim(),
      pan: f.pan.trim().toUpperCase(),
      id: `${daily ? "D" : "M"}${stamp}`,
      customerId: `C${stamp}`,
      pin: "0000",
      collectionAmount: +f.collectionAmount,
      // Daily-finance payout is always 85% of the 100-day collection amount.
      disbursedAmount: daily ? Math.round(+f.collectionAmount * 0.85) : +f.disbursedAmount,
      principal: +f.principal,
      annualRate: +f.annualRate,
      penaltyRate: +f.penaltyRate,
      dailyCollection: daily ? Math.ceil(+f.collectionAmount / 100) : 0,
      rateChanges: [],
      transactions: []
      });
    } catch (error) { setErr(error.message || "Could not create the finance account."); }
  };
  const dailyPayout = Math.round((+f.collectionAmount || 0) * 0.85);
  return <Modal close={close}><h2 className="title">New finance account</h2><div className="tabs spacer"><Button className={`tab ${f.kind === "daily" ? "active" : ""}`} onClick={() => set("kind", "daily")}>Daily Finance</Button><Button className={`tab ${f.kind === "monthly" ? "active" : ""}`} onClick={() => set("kind", "monthly")}>Monthly Finance</Button></div><div className="form spacer"><Field label="Customer name *"><input value={f.customerName} onChange={e => set("customerName", e.target.value)} /></Field><Field label="Phone *"><input value={f.phone} onChange={e => set("phone", e.target.value)} /></Field><Field label="Start date"><input type="date" value={f.startDate} onChange={e => set("startDate", e.target.value)} /></Field><Field label="Address"><input value={f.address} onChange={e => set("address", e.target.value)} /></Field><div className="notice span"><strong>KYC details</strong> — store these only with customer consent.</div><Field label="Aadhaar number"><input inputMode="numeric" maxLength="12" placeholder="12-digit Aadhaar" value={f.aadhaar} onChange={e => set("aadhaar", e.target.value.replace(/\D/g, ""))} /></Field><Field label="PAN number"><input maxLength="10" placeholder="ABCDE1234F" value={f.pan} onChange={e => set("pan", e.target.value.toUpperCase())} /></Field>{f.kind === "daily" ? <><Field label="Customer repays in 100 days (₹) *"><input type="number" value={f.collectionAmount} onChange={e => set("collectionAmount", e.target.value)} /></Field><div className="card"><div className="metric-label">Paid to customer (85%)</div><div className="metric-value gold">{money(dailyPayout)}</div></div></> : <><Field label="Principal (₹) *"><input type="number" value={f.principal} onChange={e => set("principal", e.target.value)} /></Field><Field label="Monthly interest rate (%)"><input type="number" value={f.annualRate} onChange={e => set("annualRate", e.target.value)} /></Field><Field label="Missed-interest penalty (%)"><input type="number" value={f.penaltyRate} onChange={e => set("penaltyRate", e.target.value)} /></Field></>}</div>{err && <p className="red small">{err}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Create account</Button></div></Modal>;
  return <Modal close={close}><h2 className="title">New finance account</h2><p className="copy">Customer PIN defaults to 0000; change it in a production account system.</p><div className="tabs spacer"><Button className={`tab ${f.kind === "daily" ? "active" : ""}`} onClick={() => set("kind", "daily")}>Daily Finance</Button><Button className={`tab ${f.kind === "monthly" ? "active" : ""}`} onClick={() => set("kind", "monthly")}>Monthly Finance</Button></div><div className="form spacer"><Field label="Start date"><input type="date" value={f.startDate} onChange={e => set("startDate", e.target.value)} /></Field><Field label="Customer name *"><input value={f.customerName} onChange={e => set("customerName", e.target.value)} /></Field><Field label="Phone *"><input value={f.phone} onChange={e => set("phone", e.target.value)} /></Field><Field className="span" label="Address"><input value={f.address} onChange={e => set("address", e.target.value)} /></Field>{f.kind === "daily" ? <><Field label="Customer repays in 100 days (₹) *"><input type="number" min="1" value={f.collectionAmount} onChange={e => set("collectionAmount", e.target.value)} /></Field><div className="card"><div className="metric-label">Amount paid to customer (85%)</div><div className="metric-value gold">{money(dailyPayout)}</div><div className="small">Calculated automatically</div></div><div className="notice span">The customer receives {money(dailyPayout)} and repays {money(f.collectionAmount)} over 100 days: {money(Math.ceil(+f.collectionAmount / 100 || 0))} per day.</div></> : <><Field label="Principal given to customer (₹) *"><input type="number" value={f.principal} onChange={e => set("principal", e.target.value)} /></Field><Field label="Monthly interest rate (%)"><input type="number" min="0" step=".01" value={f.annualRate} onChange={e => set("annualRate", e.target.value)} /></Field><Field label="Penalty on missed interest (%)"><input type="number" min="0" step=".01" value={f.penaltyRate} onChange={e => set("penaltyRate", e.target.value)} /></Field><div className="card"><div className="metric-label">Current monthly interest</div><div className="metric-value gold">{money(+f.principal * (+f.annualRate || 0) / 100)}</div><div className="small">No fixed repayment tenure. Principal can be repaid anytime.</div></div><div className="notice span">The customer pays monthly interest on the outstanding principal. Principal repayments reduce future monthly interest; missed interest can attract the configured penalty.</div></>}</div>{err && <p className="red small">{err}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Create finance account</Button></div></Modal>;
}
function Payment({
  loan,
  close,
  save
}) {
  const isDaily = loan.kind === "daily";
  const [f, setF] = useState({
    date: today(),
    mode: "upi",
    ref: "",
    amount: isDaily ? String(loan.dailyCollection) : "",
    interestAmount: isDaily ? "" : String(Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100)),
    principalAmount: "",
    penaltyAmount: "",
    notes: ""
  });
  const set = (k, v) => setF(x => ({
    ...x,
    [k]: v
  }));
  const submit = () => {
    const total = isDaily ? +f.amount : (+f.interestAmount || 0) + (+f.principalAmount || 0) + (+f.penaltyAmount || 0);
    if (total <= 0) return;
    save({
      ...f,
      id: `P${Date.now()}`,
      amount: total,
      interestAmount: +f.interestAmount || 0,
      principalAmount: +f.principalAmount || 0,
      penaltyAmount: +f.penaltyAmount || 0
    });
  };
  return <Modal close={close}><h2 className="title">Record payment</h2><p className="copy">{loan.customerName} · Current balance {money(loanBalance(loan))}</p><div className="form spacer"><Field label="Payment date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field><Field label="Payment mode"><select value={f.mode} onChange={e => set("mode", e.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="bank">Bank transfer</option></select></Field>{isDaily ? <Field className="span" label="Collection amount (₹)"><input type="number" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field> : <><Field label="Interest paid (₹)"><input type="number" value={f.interestAmount} onChange={e => set("interestAmount", e.target.value)} /></Field><Field label="Principal repaid (₹)"><input type="number" value={f.principalAmount} onChange={e => set("principalAmount", e.target.value)} /></Field><Field label="Penalty paid (₹)"><input type="number" value={f.penaltyAmount} onChange={e => set("penaltyAmount", e.target.value)} /></Field><div className="card"><div className="metric-label">Total received</div><div className="metric-value green">{money((+f.interestAmount || 0) + (+f.principalAmount || 0) + (+f.penaltyAmount || 0))}</div></div></>}<Field label="UPI / bank reference"><input value={f.ref} onChange={e => set("ref", e.target.value)} /></Field><Field label="Notes"><input value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div><div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Save payment</Button></div></Modal>;
}
function EditAccount({ loan, close, save }) {
  const [form, setForm] = useState({ ...loan });
  const [error, setError] = useState("");
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async () => {
    try {
      const updated = { ...form, collectionAmount: +form.collectionAmount, disbursedAmount: form.kind === "daily" ? Math.round(+form.collectionAmount * .85) : 0, dailyCollection: form.kind === "daily" ? Math.ceil(+form.collectionAmount / 100) : 0, principal: +form.principal, annualRate: +form.annualRate, penaltyRate: +form.penaltyRate };
      await save(updated); close();
    } catch (err) { setError(err.message || "Could not update the account."); }
  };
  return <Modal><h2 className="title">Edit finance account</h2><p className="copy">Correct the plan type if this account was created by mistake.</p><div className="tabs spacer"><Button className={`tab ${form.kind === "daily" ? "active" : ""}`} onClick={() => set("kind", "daily")}>Daily Finance</Button><Button className={`tab ${form.kind === "monthly" ? "active" : ""}`} onClick={() => set("kind", "monthly")}>Monthly Finance</Button></div><div className="form spacer"><Field label="Customer name"><input value={form.customerName} onChange={e => set("customerName", e.target.value)} /></Field><Field label="Phone"><input value={form.phone} onChange={e => set("phone", e.target.value)} /></Field><Field className="span" label="Address"><input value={form.address} onChange={e => set("address", e.target.value)} /></Field>{form.kind === "daily" ? <><Field label="100-day repayment amount (₹)"><input type="number" value={form.collectionAmount} onChange={e => set("collectionAmount", e.target.value)} /></Field><div className="card"><div className="metric-label">Customer payout (85%)</div><div className="metric-value gold">{money(Math.round((+form.collectionAmount || 0) * .85))}</div></div></> : <><Field label="Principal (₹)"><input type="number" value={form.principal} onChange={e => set("principal", e.target.value)} /></Field><Field label="Monthly interest rate (%)"><input type="number" value={form.annualRate} onChange={e => set("annualRate", e.target.value)} /></Field><Field label="Penalty rate (%)"><input type="number" value={form.penaltyRate} onChange={e => set("penaltyRate", e.target.value)} /></Field></>}</div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Save changes</Button></div></Modal>;
}
const Modal = ({
  children
}) => <div className="modal-bg"><div className="modal">{children}</div></div>;
function CustomerPortalSetup({ loan, close, save }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdPortalId, setCreatedPortalId] = useState("");
  const submit = async () => {
    if (!/^\d{6,}$/.test(pin)) return setError("Use a PIN with at least 6 digits.");
    if (pin !== confirm) return setError("The two PINs do not match.");
    setBusy(true); setError("");
    try {
      const portalId = await save(loan, pin);
      if (portalId) { setCreatedPortalId(portalId); setPin(""); setConfirm(""); }
      else close();
    }
    catch (err) { setError(err.message || "Could not save the customer portal PIN."); }
    finally { setBusy(false); }
  };
  const portalId = createdPortalId || loan.portalId;
  return <Modal><h2 className="title">Customer portal</h2>{portalId ? <><p className="copy">Portal ID: <strong className="gold">{portalId}</strong></p><p className="notice">Give this portal ID and the PIN to {loan.customerName} privately. They can use Customer login from the FinTrack sign-in page.</p>{createdPortalId ? <div className="row spacer"><span className="small">Portal enabled successfully.</span><Button className="primary" onClick={close}>Done</Button></div> : <><div className="tool-stack spacer"><Field label="New customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm customer PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Reset PIN"}</Button></div></>}</> : <><p className="copy">Enable private dashboard access for {loan.customerName}.</p><p className="notice">Choose a unique PIN and share it privately with the customer. FinTrack will create a portal ID for this account.</p><div className="tool-stack spacer"><Field label="New customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm customer PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Enable customer portal"}</Button></div></>}</Modal>;
}
function KycDetails({ loan, kyc, edit }) {
  return <div className="card spacer"><div className="toolbar"><div><strong>KYC details</strong><p className="small">Visible only to your financier workspace.</p></div><Button onClick={() => edit(loan)}>Edit KYC</Button></div><div className="grid metrics"><Metric label="Aadhaar number" value={kyc?.aadhaar || "Not added"} color={kyc?.aadhaar ? "gold" : ""} /><Metric label="PAN number" value={kyc?.pan || "Not added"} color={kyc?.pan ? "gold" : ""} /></div></div>;
}
function KycEditor({ loan, current, close, save }) {
  const [aadhaar, setAadhaar] = useState(current?.aadhaar || "");
  const [pan, setPan] = useState(current?.pan || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError("");
    try { await save(loan, aadhaar, pan); close(); }
    catch (err) { setError(err.message || "Could not save KYC details."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">KYC details</h2><p className="notice">These details are encrypted in the database and are never shown to customers.</p><div className="form spacer"><Field label="Aadhaar number"><input inputMode="numeric" maxLength="12" value={aadhaar} onChange={event => setAadhaar(event.target.value.replace(/\D/g, ""))} /></Field><Field label="PAN number"><input maxLength="10" value={pan} onChange={event => setPan(event.target.value.toUpperCase())} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save KYC"}</Button></div></Modal>;
}
function FinanceDetail({
  loan,
  back,
  collect,
  addRate,
  edit,
  remove,
  portal,
  kyc,
  editKyc
}) {
  const monthly = loan.kind === "monthly",
    [rate, setRate] = useState({
      effectiveDate: today(),
      annualRate: ""
    });
  const paymentRows = [...loan.transactions].sort((a, b) => b.date.localeCompare(a.date));
  return <><div className="toolbar"><div><Button onClick={back}>← Back</Button><h1 className="title spacer">{loan.customerName}</h1><p className="copy">{loan.phone} · {loan.address || "Address not added"}</p></div><div className="tabs"><Button onClick={() => portal(loan)}>Customer portal</Button><Button onClick={() => edit(loan)}>Edit account</Button><Button className="danger" onClick={() => remove(loan)}>Delete account</Button><Button className="primary" onClick={() => collect(loan)}>+ Record payment</Button></div></div><KycDetails loan={loan} kyc={kyc} edit={editKyc} /><div className="grid metrics"><Metric label={monthly ? "Principal financed" : "Customer repays"} value={money(monthly ? loan.principal : loan.collectionAmount)} color="gold" /><Metric label={monthly ? "Principal balance" : "Paid to customer"} value={money(monthly ? monthlyBalance(loan) : loan.disbursedAmount)} color="red" /><Metric label="Total received" value={money(loanPaid(loan))} color="green" />{monthly ? <><Metric label="Interest pending" value={money(monthlyInterestPending(loan))} color={monthlyInterestPending(loan) ? "red" : "green"} /><Metric label="Estimated penalty" value={money(estimatedPenalty(loan))} color="red" /></> : <Metric label="Daily collection" value={`${money(loan.dailyCollection)} × 100 days`} color="blue" />}</div>{monthly && <div className="grid two"><div className="card"><strong>Monthly interest status</strong><div className="table spacer"><table><thead><tr><th>Month</th><th>Due date</th><th>Principal at due date</th><th>Rate</th><th>Interest due</th></tr></thead><tbody>{monthlyDueRows(loan).map(r => <tr key={r.number}><td>{r.number}</td><td>{r.dueDate}</td><td>{money(r.balance)}</td><td>{r.annualRate}%</td><td>{money(r.interest)}</td></tr>)}</tbody></table></div><div className="notice">Interest due {money(monthlyInterestDue(loan))} · Interest received {money(monthlyInterestPaid(loan))} · Missed months {missedMonths(loan)}. Penalty shown is an estimate using your configured rate.</div></div><div className="card"><strong>Change monthly interest rate</strong><p className="small">This applies to interest due from the selected date onward.</p><div className="spacer"><Field label="Effective date"><input type="date" min={loan.startDate} value={rate.effectiveDate} onChange={e => setRate({
              ...rate,
              effectiveDate: e.target.value
            })} /></Field></div><div className="spacer"><Field label="New monthly rate (%)"><input type="number" min="0" step=".01" value={rate.annualRate} onChange={e => setRate({
              ...rate,
              annualRate: e.target.value
            })} /></Field></div><Button className="primary spacer" onClick={() => rate.annualRate !== "" && (addRate(loan, {
          ...rate,
          annualRate: +rate.annualRate
        }), setRate({
          ...rate,
          annualRate: ""
        }))}>Save rate change</Button><div className="spacer"><strong>Rate history</strong>{[{
            effectiveDate: loan.startDate,
            annualRate: loan.annualRate
          }, ...loan.rateChanges].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((r, i) => <div className="row small" key={i} style={{
            padding: "8px 0",
            borderBottom: `1px solid ${C.line}`
          }}><span>From {r.effectiveDate}</span><span className="gold">{r.annualRate}% monthly</span></div>)}</div></div></div>}<div className="card spacer"><strong>Payment history</strong><div className="table spacer"><table><thead><tr><th>Date</th>{monthly && <><th>Interest</th><th>Principal</th><th>Penalty</th></>}<th>Total</th><th>Mode</th><th>Reference</th></tr></thead><tbody>{paymentRows.map(t => <tr key={t.id}><td>{t.date}</td>{monthly && <><td>{money(t.interestAmount)}</td><td>{money(t.principalAmount)}</td><td>{money(t.penaltyAmount)}</td></>}<td className="green">{money(monthly ? (+t.interestAmount || 0) + (+t.principalAmount || 0) + (+t.penaltyAmount || 0) : t.amount)}</td><td>{t.mode}</td><td>{t.ref || "—"}</td></tr>)}</tbody></table></div></div></>;
}
function TodayCollections({ loans, back, collect, view }) {
  const [search, setSearch] = useState("");
  const activeLoans = loans.filter(loan => loanBalance(loan) > 0);
  const dailyLoans = activeLoans.filter(loan => loan.kind === "daily");
  const monthlyLoans = activeLoans.filter(loan => loan.kind === "monthly");
  const paidToday = loan => loan.transactions.some(transaction => transaction.date === today());
  const collectedToday = activeLoans.filter(paidToday).length;
  const expectedToday = dailyLoans.reduce((sum, loan) => sum + loan.dailyCollection, 0) + monthlyLoans.reduce((sum, loan) => sum + Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100), 0);
  const receivedToday = activeLoans.reduce((sum, loan) => sum + loan.transactions.filter(transaction => transaction.date === today()).reduce((total, transaction) => total + paymentValue(loan, transaction), 0), 0);
  const matchesSearch = loan => `${loan.customerName} ${loan.phone} ${loan.address || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  const shownDailyLoans = dailyLoans.filter(matchesSearch);
  const shownMonthlyLoans = monthlyLoans.filter(matchesSearch);
  return <main className="shell collection-shell"><header className="top"><div><Button onClick={back}>← Dashboard</Button><h1 className="title spacer">Today’s collections</h1><p className="copy">{today()} · Daily collection and monthly-interest accounts.</p></div></header><div className="collection-search"><input aria-label="Search customer" placeholder="Search by customer name, phone, or address" value={search} onChange={event => setSearch(event.target.value)} />{search && <Button onClick={() => setSearch("")}>Clear</Button>}</div><div className="collection-summary"><div><span>Collected today</span><strong>{collectedToday} / {activeLoans.length}</strong></div><div><span>Received today</span><strong className="green">{money(receivedToday)}</strong></div><div><span>Daily + monthly due</span><strong className="gold">{money(expectedToday)}</strong></div></div><div className="collection-section"><h2>Daily finance <span>{shownDailyLoans.length} shown</span></h2><div className="collection-list">{shownDailyLoans.length === 0 ? <div className="card">No matching daily-finance customers.</div> : shownDailyLoans.map(loan => { const paid = paidToday(loan); return <CollectionCard key={loan.id} loan={loan} paid={paid} label="Daily collection" due={loan.dailyCollection} balance={dailyBalance(loan)} collect={collect} view={view} />; })}</div></div><div className="collection-section"><h2>Monthly finance <span>{shownMonthlyLoans.length} shown</span></h2><p className="copy">Monthly cards show interest due on the current outstanding principal.</p><div className="collection-list">{shownMonthlyLoans.length === 0 ? <div className="card">No matching monthly-finance customers.</div> : shownMonthlyLoans.map(loan => { const paid = paidToday(loan); const interest = Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100); return <CollectionCard key={loan.id} loan={loan} paid={paid} label={`${annualRate(loan, today())}% monthly interest`} due={interest} balance={monthlyBalance(loan)} collect={collect} view={view} monthly />; })}</div></div></main>;
}
function CollectionCard({ loan, paid, label, due, balance, collect, view, monthly = false }) {
  return <article className={`collection-card ${paid ? "collected" : ""} ${monthly ? "monthly-card" : "daily-card"}`}><div className="collection-avatar">{loan.customerName.charAt(0).toUpperCase()}</div><div className="collection-info"><strong>{loan.customerName}</strong><span>{loan.phone}</span><span>{loan.address || "Address not added"}</span></div><div className="collection-amount"><span>{paid ? "Collected" : label}</span><strong className={paid ? "green" : "gold"}>{paid ? "✓ Paid" : money(due)}</strong><small>{monthly ? "Principal" : "Balance"} {money(balance)}</small></div><div className="collection-actions"><Button onClick={() => view(loan)}>Details</Button>{!paid && <Button className="primary" onClick={() => collect(loan)}>Collect</Button>}</div></article>;
}
function Financier({
  loans,
  businessName,
  logout,
  setLoans,
  onCreateLoan,
  onRecordPayment,
  onUpdateLoan,
  onDeleteLoan,
  onSaveCustomerPortal,
  onLoadKyc,
  onSaveKyc
}) {
  const [modal, setModal] = useState(null),
    [detail, setDetail] = useState(null),
    [editLoan, setEditLoan] = useState(null),
    [portalLoan, setPortalLoan] = useState(null),
    [collectionMode, setCollectionMode] = useState(false),
    [editKycLoan, setEditKycLoan] = useState(null),
    [kyc, setKyc] = useState(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [reportDate, setReportDate] = useState(today());
  const shown = (filter === "all" ? loans : loans.filter(l => l.kind === filter)).filter(loan => `${loan.customerName} ${loan.phone} ${loan.address || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const total = loans.reduce((s, l) => s + (l.kind === "daily" ? l.collectionAmount : l.principal), 0);
  const addPayment = async t => {
    await onRecordPayment(modal, t);
    setModal(null);
  };
  useEffect(() => {
    if (!detail) { setKyc(null); return; }
    onLoadKyc(detail).then(setKyc).catch(() => setKyc(null));
  }, [detail?.id]);
  if (collectionMode) return <><TodayCollections loans={loans} back={() => setCollectionMode(false)} collect={setModal} view={loan => { setDetail(loan); setCollectionMode(false); }} />{modal && <Payment loan={modal} close={() => setModal(null)} save={addPayment} />}</>;
  if (detail) {
    const loan = loans.find(l => l.id === detail.id);
    return <main className="shell"><FinanceDetail loan={loan} back={() => setDetail(null)} collect={setModal} edit={setEditLoan} remove={async account => { if (window.confirm(`Delete ${account.customerName}'s finance account and all its payments? This cannot be undone.`)) { await onDeleteLoan(account); setDetail(null); } }} addRate={(l, r) => setLoans(x => x.map(a => a.id === l.id ? {
        ...a,
        rateChanges: [...a.rateChanges, r]
      } : a))} portal={setPortalLoan} kyc={kyc} editKyc={setEditKycLoan} />{modal && <Payment loan={modal} close={() => setModal(null)} save={addPayment} />}{editLoan && <EditAccount loan={loan} close={() => setEditLoan(null)} save={onUpdateLoan} />}{portalLoan && <CustomerPortalSetup loan={loan} close={() => setPortalLoan(null)} save={onSaveCustomerPortal} />}{editKycLoan && <KycEditor loan={loan} current={kyc} close={() => setEditKycLoan(null)} save={async (account, aadhaar, pan) => { await onSaveKyc(account, aadhaar, pan); setKyc(await onLoadKyc(account)); }} />}</main>;
  }
  return <main className="shell"><header className="top"><div><div className="brand">{businessName || "My Finance Business"}</div><div className="sub">Financier dashboard · Daily & monthly collections</div></div><Button onClick={logout}>Log out</Button></header><div className="toolbar"><div><h1 className="title">Finance portfolio</h1><p className="copy">Every account, collection, balance, and interest due in one place.</p></div><div className="tabs"><Field label="Daily report date"><input type="date" value={reportDate} onChange={event => setReportDate(event.target.value)} /></Field><Button onClick={() => downloadDailyReport(loans, reportDate)}>Download daily report</Button><Button onClick={() => setCollectionMode(true)}>Today’s collections</Button><Button className="primary" onClick={() => setModal("new")}>+ New finance account</Button></div></div><div className="grid metrics"><Metric label="Customers" value={loans.length} color="blue" /><Metric label="Amount financed" value={money(total)} color="gold" /><Metric label="Amounts received" value={money(loans.reduce((s, l) => s + loanPaid(l), 0))} color="green" /><Metric label="Principal / collection balance" value={money(loans.reduce((s, l) => s + loanBalance(l), 0))} color="red" /><Metric label="Overdue accounts" value={loans.filter(l => loanStatus(l) === "overdue").length} color="red" /></div><div className="card"><div className="toolbar"><strong>Customer accounts</strong><div className="tabs"><Button className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</Button><Button className={`tab ${filter === "daily" ? "active" : ""}`} onClick={() => setFilter("daily")}>Daily</Button><Button className={`tab ${filter === "monthly" ? "active" : ""}`} onClick={() => setFilter("monthly")}>Monthly</Button></div></div><div className="customer-search"><input aria-label="Search customer" placeholder="Search name, phone, or address" value={search} onChange={event => setSearch(event.target.value)} />{search && <Button onClick={() => setSearch("")}>Clear</Button>}</div><div className="table"><table><thead><tr><th>Customer</th><th>Finance</th><th>Amount financed</th><th>Paid</th><th>Balance</th><th>Interest due</th><th>Status</th><th></th></tr></thead><tbody>{shown.map(l => <tr key={l.id}><td><div style={{ display:"flex", alignItems:"center", gap:10 }}><span style={{ width:34, height:34, borderRadius:"50%", display:"grid", placeItems:"center", background:"rgba(114,170,255,.16)", color:C.blue, fontWeight:700 }}>{l.customerName.charAt(0).toUpperCase()}</span><div><strong>{l.customerName}</strong><br /><span className="small">{l.phone}</span></div></div></td><td>{l.kind === "daily" ? "Daily · 100 days" : "Monthly interest"}<br /><span className="small">{l.kind === "monthly" ? `${annualRate(l, today())}% per month` : `${money(l.dailyCollection)}/day`}</span></td><td>{money(l.kind === "daily" ? l.collectionAmount : l.principal)}</td><td className="green">{money(loanPaid(l))}</td><td className="red">{money(loanBalance(l))}</td><td>{l.kind === "monthly" ? money(monthlyInterestPending(l)) : "—"}</td><td><Badge status={loanStatus(l)} /></td><td><Button onClick={() => setDetail(l)}>View</Button> <Button className="primary" onClick={() => setModal(l)}>Collect</Button></td></tr>)}</tbody></table></div>{shown.length === 0 && <p className="small spacer">No customers match your search.</p>}</div>{modal === "new" && <NewFinance close={() => setModal(null)} save={async loan => { await onCreateLoan(loan); setModal(null); }} />}{modal && modal !== "new" && <Payment loan={modal} close={() => setModal(null)} save={addPayment} />}</main>;
}
function Customer({
  loan,
  logout
}) {
  const monthly = loan.kind === "monthly";
  return <main className="shell" style={{
    maxWidth: 700
  }}><header className="top"><div><div className="brand">FinTrack</div><div className="sub">Customer dashboard</div></div><Button onClick={logout}>Log out</Button></header><h1 className="title">Hello, {loan.customerName}</h1><p className="copy">Your finance ID: {loan.id}</p>{monthly ? <><div className="notice">You have taken {money(loan.principal)} on interest. Pay your monthly interest on time; you may repay the principal whenever you choose.</div><div className="grid metrics"><Metric label="Principal taken" value={money(loan.principal)} color="gold" /><Metric label="Principal remaining" value={money(monthlyBalance(loan))} color="red" /><Metric label="Monthly interest rate" value={`${annualRate(loan, today())}%`} color="blue" /><Metric label="Interest pending" value={money(monthlyInterestPending(loan))} color={monthlyInterestPending(loan) ? "red" : "green"} /><Metric label="Paid so far" value={money(loanPaid(loan))} color="green" /></div><div className="card"><strong>What you need to pay</strong><div className="row spacer"><span className="small">Current monthly interest on balance</span><strong className="gold">{money(Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100))}</strong></div><div className="row spacer"><span className="small">Estimated missed-payment penalty</span><strong className="red">{money(estimatedPenalty(loan))}</strong></div><p className="notice">Payment can be made via UPI, cash, or bank transfer. Contact your financier to record the payment.</p></div></> : <><div className="notice">You received {money(loan.disbursedAmount)}. Your daily collection plan is {money(loan.collectionAmount)} over 100 days.</div><div className="grid metrics"><Metric label="Amount received" value={money(loan.disbursedAmount)} color="gold" /><Metric label="Total to repay" value={money(loan.collectionAmount)} color="blue" /><Metric label="Daily collection" value={money(loan.dailyCollection)} color="gold" /><Metric label="Paid so far" value={money(dailyPaid(loan))} color="green" /><Metric label="Remaining" value={money(dailyBalance(loan))} color="red" /></div><div className="card"><strong>Repayment progress</strong><p className="small spacer">{Math.round(dailyPaid(loan) / loan.collectionAmount * 100)}% paid · {Math.max(0, 100 - elapsedDays(loan.startDate))} collection days remaining</p></div></>}<div className="card spacer"><strong>Your payment history</strong><div className="table spacer"><table><thead><tr><th>Date</th><th>Amount paid</th><th>Mode</th><th>Reference</th></tr></thead><tbody>{[...loan.transactions].sort((a, b) => b.date.localeCompare(a.date)).map(t => <tr key={t.id}><td>{t.date}</td><td className="green">{money(monthly ? (+t.interestAmount || 0) + (+t.principalAmount || 0) + (+t.penaltyAmount || 0) : t.amount)}</td><td>{t.mode}</td><td>{t.ref || "—"}</td></tr>)}</tbody></table></div></div></main>;
}
function PinResetModal({ title, currentPin, onSave, close }) {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const save = () => {
    if (oldPin !== currentPin) return setError("Current PIN is incorrect.");
    if (!/^\d{4,}$/.test(newPin)) return setError("New PIN must be at least 4 digits.");
    if (newPin !== confirmPin) return setError("New PINs do not match.");
    onSave(newPin);
    close();
  };
  return <Modal><h2 className="title">Reset {title} PIN</h2><p className="copy">Choose a secure numeric PIN with at least four digits.</p><div className="tool-stack spacer"><Field label="Current PIN"><input type="password" value={oldPin} onChange={event => setOldPin(event.target.value)} /></Field><Field label="New PIN"><input type="password" value={newPin} onChange={event => setNewPin(event.target.value)} /></Field><Field label="Confirm new PIN"><input type="password" value={confirmPin} onChange={event => setConfirmPin(event.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={save}>Save new PIN</Button></div></Modal>;
}
function FinancierTools({ loans, adminPin, setAdminPin }) {
  const [panel, setPanel] = useState(null);
  const [reportDate, setReportDate] = useState(today());
  return <div className="financier-tools">
    <aside className="financier-nav">
      <div className="nav-title">FinTrack</div>
      <Button className={panel === null ? "tab active" : ""} onClick={() => { setPanel(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>▦ Dashboard</Button>
      <Button className={panel === "reports" ? "tab active" : ""} onClick={() => setPanel("reports")}>↧ Reports</Button>
      <Button className={panel === "security" ? "tab active" : ""} onClick={() => setPanel("security")}>⌁ Security</Button>
      <div className="nav-footer">Financier workspace</div>
    </aside>
    {panel === "reports" && <Modal><h2 className="title">Daily collection report</h2><div className="spacer"><Field label="Report date"><input type="date" value={reportDate} onChange={event => setReportDate(event.target.value)} /></Field></div><div className="row spacer"><Button onClick={() => setPanel(null)}>Close</Button><Button className="primary" onClick={() => downloadDailyReport(loans, reportDate)}>Download CSV</Button></div></Modal>}
    {panel === "security" && <PinResetModal title="financier" currentPin={adminPin} onSave={setAdminPin} close={() => setPanel(null)} />}
  </div>;
}
function CustomerReportDownload({ loan, onResetPin }) {
  const [reset, setReset] = useState(false);
  return <div className="customer-actions" style={{
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 5
  }}><div className="tabs">{onResetPin && <Button onClick={() => setReset(true)}>Reset PIN</Button>}<Button className="primary" onClick={() => downloadCustomerReport(loan)}>Download payment report</Button></div>{reset && onResetPin && <PinResetModal title="customer" currentPin={loan.pin} onSave={onResetPin} close={() => setReset(false)} />}</div>;
}
export default function App() {
  const [user, setUser] = useState(() => {
    const authToken = supabase.auth.getAccessToken();
    return authToken ? { role: "financier", authToken } : null;
  });
  const [adminPin, setAdminPin] = useState(() => localStorage.getItem("fintrack_admin_pin_v1") || "1234");
  const [loans, setLoans] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [dataError, setDataError] = useState("");
  const refreshLoans = async (token = user?.authToken) => {
    if (!token) return;
    try { setLoans(await loadFinanceAccounts(token)); setDataError(""); }
    catch (error) { setDataError(error.message || "Could not load finance records."); }
  };
  useEffect(() => { refreshLoans(); }, [user?.authToken]);
  useEffect(() => {
    if (!user?.authToken) { setWorkspace(null); return; }
    loadWorkspace(user.authToken).then(setWorkspace).catch(() => setWorkspace(null));
  }, [user?.authToken]);
  useEffect(() => localStorage.setItem("fintrack_admin_pin_v1", adminPin), [adminPin]);
  const customerLoan = user?.role === "customer" ? user.loan : null;
  const logout = () => { if (user?.role === "financier") supabase.auth.clearSession(); setUser(null); };
  const createLoan = async loan => { const accountId = await createFinanceAccount(user.authToken, loan); if (loan.aadhaar || loan.pan) await saveCustomerKyc(user.authToken, accountId, loan.aadhaar || "", loan.pan || ""); await refreshLoans(); };
  const savePayment = async (loan, payment) => { await recordPayment(user.authToken, loan, payment); await refreshLoans(); };
  const updateLoan = async loan => { await updateFinanceAccount(user.authToken, loan); await refreshLoans(); };
  const removeLoan = async loan => { await deleteFinanceAccount(user.authToken, loan.id); await refreshLoans(); };
  const saveCustomerPortal = async (loan, pin) => { const portalId = loan.portalId ? (await resetCustomerPortalPin(user.authToken, loan.id, pin), "") : await enableCustomerPortal(user.authToken, loan.id, pin); await refreshLoans(); return portalId; };
  const getKyc = loan => loadCustomerKyc(user.authToken, loan.id);
  const updateKyc = (loan, aadhaar, pan) => saveCustomerKyc(user.authToken, loan.id, aadhaar, pan);
  return <div className="app"><style>{styles + enhancements + homeReportHide + visualRefresh + mobileCollections}</style>{!user ? <FinancierAuth onLogin={setUser} onCustomerLogin={loan => setUser({ role: "customer", loan })} /> : user.role === "financier" ? <>{dataError && <div className="notice" style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}>{dataError}</div>}<Financier loans={loans} businessName={workspace?.businessName} setLoans={setLoans} onCreateLoan={createLoan} onRecordPayment={savePayment} onUpdateLoan={updateLoan} onDeleteLoan={removeLoan} onSaveCustomerPortal={saveCustomerPortal} onLoadKyc={getKyc} onSaveKyc={updateKyc} logout={logout} /><FinancierTools loans={loans} adminPin={adminPin} setAdminPin={setAdminPin} /></> : <><Customer loan={customerLoan} logout={logout} /><CustomerReportDownload loan={customerLoan} /></>}</div>;
}
