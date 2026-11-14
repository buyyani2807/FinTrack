import { useEffect, useMemo, useState } from "react";
import { loadUpcomingChitPayments } from "../../../lib/financeRepository.js";
import { today } from "../../finance/model/loanState.js";
import { ModuleInsightsCard } from "../../intelligence/ModuleInsightsCard.jsx";
import { buildChitIntelligence } from "../model/chitIntelligence.js";
import { Spinner } from "../../../components/ui.jsx";

export function ChitInsightsBrief({
  schemes = [],
  enrollments = [],
  cycles = [],
  fixedLifts = [],
  predefinedSchedule = [],
  token,
  asOf,
  onViewMembers,
  loading = false,
}) {
  const [nonce, setNonce] = useState(0);
  // null until the upcoming installments have loaded, so the card never shows zeros that are not real.
  const [upcomingRows, setUpcomingRows] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    let ignore = false;
    const timer = window.setTimeout(() => {
      loadUpcomingChitPayments(token)
        .then(rows => {
          if (ignore) return;
          setUpcomingRows(rows || []);
        })
        .catch(() => {
          if (ignore) return;
          setUpcomingRows([]);
        });
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [token, schemes, nonce]);

  const result = useMemo(() => {
    try {
      return buildChitIntelligence({
        schemes,
        enrollments,
        cycles,
        fixedLifts,
        predefinedSchedule,
        upcomingRows: upcomingRows || [],
        asOf: asOf || today(),
      });
    } catch {
      return { failed: true };
    }
  }, [schemes, enrollments, cycles, fixedLifts, predefinedSchedule, upcomingRows, asOf, nonce]);

  if (loading || (token && upcomingRows === null)) {
    return <section className="card module-intel" aria-label="AI chit fund insights" aria-busy="true">
      <p className="small ft-loading-note"><Spinner size="sm" label="Loading" />Loading chit fund insights…</p>
    </section>;
  }

  return (
    <ModuleInsightsCard
      report={result.failed ? null : result.report}
      failed={Boolean(result.failed)}
      onRetry={() => setNonce(value => value + 1)}
      onNavigate={target => {
        if (target === "members") onViewMembers?.();
      }}
    />
  );
}
