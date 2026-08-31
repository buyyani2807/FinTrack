export function staffAssignableLoans(loans, { selectedAgentId, search = "", statusOf } = {}) {
  const query = String(search || "").toLowerCase();
  return (loans || []).filter(loan =>
    statusOf(loan) === "active"
    && (!loan.collectionAgentId || loan.collectionAgentId === selectedAgentId)
    && `${loan.customerName || ""} ${loan.phone || ""}`.toLowerCase().includes(query)
  );
}

export function financeKindLabel(kind) {
  return kind === "monthly" ? "Monthly" : "Daily";
}
