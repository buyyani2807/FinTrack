import { CheckCheck, MapPin, TrendingUp } from "lucide-react";

// Decorative product preview beside the sign-in form (sample figures, hidden from screen readers).
const CALENDAR_DAYS = Array.from({ length: 21 }, (_, index) => index + 8);

export function AuthShowcase() {
  return (
    <aside className="ft-auth-showcase" aria-hidden="true">
      <div className="ft-auth-showcase-copy">
        <p className="ft-auth-kicker">Finance · Chit Fund · Accounts</p>
        <h2>Every collection, scheme and ledger in one place.</h2>
        <p>Daily and monthly finance, chit auctions, cashbook and GST-ready books for your business.</p>
      </div>

      <div className="ft-auth-float ft-auth-collections">
        <span className="ft-auth-float-label">Today&rsquo;s collections</span>
        <strong>₹42,600</strong>
        <span className="ft-auth-trend"><TrendingUp size={14} /> 12% vs yesterday</span>
        <svg viewBox="0 0 160 48" className="ft-auth-spark">
          <path d="M2 40 L26 30 L48 34 L72 18 L96 24 L120 10 L158 4" />
          <circle cx="120" cy="10" r="3.5" />
          <circle cx="158" cy="4" r="3.5" />
        </svg>
      </div>

      <div className="ft-auth-float ft-auth-cashcard">
        <span className="ft-auth-float-label">FinTrack Cashbook</span>
        <strong>₹2,48,500</strong>
        <span className="ft-auth-cashcard-foot"><span>Cash · Bank · UPI</span><span className="ft-auth-chip-dots"><i /><i /></span></span>
      </div>

      <div className="ft-auth-float ft-auth-calendar">
        <span className="ft-auth-float-label">October · Chit auction</span>
        <span className="ft-auth-calendar-grid">
          {CALENDAR_DAYS.map(day => <span key={day} className={day === 15 ? "is-event" : ""}>{day === 15 ? day : ""}</span>)}
        </span>
      </div>

      <div className="ft-auth-float ft-auth-route">
        <span className="ft-auth-route-pin"><MapPin size={18} /></span>
        <span><strong>Route 3</strong><span>12 stops · 9 collected</span></span>
      </div>

      <div className="ft-auth-float ft-auth-toast">
        <span className="ft-auth-toast-icon"><CheckCheck size={14} /></span>
        Receipt sent on WhatsApp
      </div>
    </aside>
  );
}
