import { useEffect, useMemo, useState } from "react";
import { loadUpcomingChitPayments } from "../../lib/financeRepository.js";
import { today } from "../finance/loanState.js";
import { ModuleInsightsCard } from "../intelligence/ModuleInsightsCard.jsx";
import { buildChitIntelligence } from "./chitIntelligence.js";

export function ChitInsightsBrief({
  schemes = [],
  enrollments = [],
  cycles = [],
  fixedLifts = [],
  predefinedSchedule = [],
  token,
  asOf,
  onViewMembers,
}) {
  const [nonce, setNonce] = useState(0);
  const [upcomingRows, setUpcomingRows] = useState([]);

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
        upcomingRows,
        asOf: asOf || today(),
      });
    } catch {
      return { failed: true };
    }
  }, [schemes, enrollments, cycles, fixedLifts, predefinedSchedule, upcomingRows, asOf, nonce]);

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
