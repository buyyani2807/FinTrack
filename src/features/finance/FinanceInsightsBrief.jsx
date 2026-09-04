import { useMemo, useState } from "react";
import { buildFinanceIntelligence } from "./financeIntelligence.js";
import { today } from "./loanState.js";
import { ModuleInsightsCard } from "../intelligence/ModuleInsightsCard.jsx";

export function FinanceInsightsBrief({
  kind,
  loans = [],
  isOwner = true,
  asOf,
  onViewCustomers,
}) {
  const [nonce, setNonce] = useState(0);
  const result = useMemo(() => {
    try {
      return buildFinanceIntelligence(kind, loans, { asOf: asOf || today(), isOwner });
    } catch {
      return { failed: true };
    }
  }, [kind, loans, isOwner, asOf, nonce]);

  return (
    <ModuleInsightsCard
      report={result.failed ? null : result.report}
      failed={Boolean(result.failed)}
      onRetry={() => setNonce(value => value + 1)}
      onNavigate={target => {
        if (target === "customers") onViewCustomers?.();
      }}
    />
  );
}
