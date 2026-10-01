import { BellRing, CheckCheck, MapPin, TrendingUp } from "lucide-react";

// Decorative product preview beside the sign-in form (sample figures, hidden from screen readers).
// Everything inside .ft-auth-stage is sized in one scale unit (--u), so the composition grows and
// shrinks as a whole with the space available instead of drifting apart on wide screens.
const BARS = [[58, 82], [44, 60], [62, 40], [56, 74], [48, 70], [30, 90], [52, 66]];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const CALENDAR = Array.from({ length: 21 }, (_, index) => index + 8);

export function AuthShowcase() {
  return (
    <aside className="ft-auth-showcase" aria-hidden="true">
      <span className="ft-auth-showcase-brand ft-brand"><span className="ft-brand-strong">FIN</span>Track</span>
      <div className="ft-auth-showcase-copy">
        <p className="ft-auth-kicker">Finance · Chit Fund · Accounts</p>
        <h2>Every collection, scheme and ledger in one place.</h2>
        <p>Daily and monthly finance, chit auctions, cashbook and GST-ready books for your business.</p>
      </div>

      <div className="ft-auth-stage">
        <div className="ft-auth-cluster">
          <div className="ft-auth-tile ft-auth-dashboard">
            <span className="ft-auth-tile-label">Today&rsquo;s collections</span>
            <span className="ft-auth-dashboard-head">
              <strong>₹42,600</strong>
              <span className="ft-auth-trend"><TrendingUp /> 12%</span>
            </span>
            <span className="ft-auth-bars">
              {BARS.map(([last, now], index) => <span key={index} className="ft-auth-bar">
                <i style={{ height: `${last}%` }} /><i style={{ height: `${now}%` }} />
                <em>{DAYS[index]}</em>
              </span>)}
            </span>
            <span className="ft-auth-legend"><i /> This week <i /> Last week</span>
          </div>

          <div className="ft-auth-tile ft-auth-cashcard">
            <span className="ft-auth-tile-label">FinTrack Cashbook</span>
            <strong>₹2,48,500</strong>
            <span className="ft-auth-cashcard-foot"><span>Cash · Bank · UPI</span><span className="ft-auth-chip-dots"><i /><i /></span></span>
          </div>

          <div className="ft-auth-tile ft-auth-calendar">
            <span className="ft-auth-tile-label">October · Chit auction</span>
            <span className="ft-auth-calendar-grid">
              {CALENDAR.map(day => <span key={day} className={day === 15 ? "is-event" : ""}>{day === 15 ? day : ""}</span>)}
            </span>
          </div>

          <div className="ft-auth-tile ft-auth-score">
            <span className="ft-auth-tile-label">Credit score</span>
            <svg viewBox="0 0 100 56" className="ft-auth-gauge">
              <path className="track" d="M8 50 A42 42 0 0 1 92 50" />
              <path className="value" d="M8 50 A42 42 0 0 1 78 20" />
            </svg>
            <span className="ft-auth-score-value"><strong>742</strong><span>Good</span></span>
          </div>

          <div className="ft-auth-tile ft-auth-route">
            <span className="ft-auth-icon-box"><MapPin /></span>
            <span><strong>Route 3</strong><span>12 stops · 9 collected</span></span>
          </div>

          <div className="ft-auth-tile ft-auth-agents">
            <span className="ft-auth-avatars"><i>RK</i><i>LD</i><i>SB</i><i>+2</i></span>
            <span><strong>5 agents</strong><span>on route now</span></span>
          </div>

          <div className="ft-auth-tile ft-auth-due">
            <span className="ft-auth-icon-box"><BellRing /></span>
            <span><strong>₹8,400 due today</strong><span>6 customers · reminders on</span></span>
          </div>

          <div className="ft-auth-tile ft-auth-toast">
            <span className="ft-auth-toast-icon"><CheckCheck /></span>
            Receipt sent on WhatsApp
          </div>
        </div>
      </div>
    </aside>
  );
}
