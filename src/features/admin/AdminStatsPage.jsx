import { useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import { loadAdminSignupStats } from "./adminRepository.js";

// Not linked from any menu. Visible at /admin/platform-stats, but the data call
// itself is restricted server-side to one operator account (see
// supabase/153_admin_platform_stats.sql) — anyone else signed in sees the
// same "not available" state below, same as if the route didn't exist.
export function AdminStatsPage() {
  const { token } = useOutletContext();
  const [stats, setStats] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | denied

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    loadAdminSignupStats(token)
      .then(result => {
        if (cancelled) return;
        setStats(result);
        setState("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setState("denied");
      });
    return () => { cancelled = true; };
  }, [token]);

  if (state === "loading") {
    return <div className="shell"><p>Loading…</p></div>;
  }
  if (state === "denied" || !stats) {
    return <div className="shell"><p>This page isn't available.</p></div>;
  }

  const byStatus = stats.by_subscription_status || {};
  const trend = Array.isArray(stats.signups_last_30_days) ? stats.signups_last_30_days : [];

  return (
    <div className="shell admin-stats">
      <h1>Platform signups</h1>
      <p className="admin-stats-asof">As of {new Date(stats.generated_at).toLocaleString("en-IN")}</p>

      <div className="admin-stats-cards">
        <div className="admin-stats-card">
          <span className="admin-stats-card-label">Total signups</span>
          <span className="admin-stats-card-value">{stats.total_organizations}</span>
        </div>
        <div className="admin-stats-card">
          <span className="admin-stats-card-label">Confirmed email</span>
          <span className="admin-stats-card-value">{stats.confirmed_users}</span>
        </div>
        <div className="admin-stats-card">
          <span className="admin-stats-card-label">Unconfirmed email</span>
          <span className="admin-stats-card-value">{stats.unconfirmed_users}</span>
        </div>
        <div className="admin-stats-card">
          <span className="admin-stats-card-label">Set up Accounts/POS</span>
          <span className="admin-stats-card-value">{stats.organizations_with_accounts_setup}</span>
        </div>
      </div>

      <h2>By subscription status</h2>
      <ul className="admin-stats-status-list">
        {Object.entries(byStatus).map(([status, count]) => (
          <li key={status}><span>{status.replace(/_/g, " ")}</span><strong>{count}</strong></li>
        ))}
      </ul>

      <h2>Signups — last 30 days</h2>
      {trend.length ? (
        <table className="admin-stats-trend">
          <thead><tr><th>Day</th><th>Signups</th></tr></thead>
          <tbody>
            {trend.map(row => (
              <tr key={row.day}>
                <td>{new Date(row.day).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No signups in the last 30 days.</p>}
    </div>
  );
}
