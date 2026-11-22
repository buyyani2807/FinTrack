// Status values such as "active" or "part_paid" are shown as "Active" / "Part paid".
// Text that is already written for people ("Completed", "Reorder 5") is left as it is.
const STATUS_LABELS = { bankrupt: "Defaulter" };

export function badgeLabel(status) {
  if (typeof status !== "string" || !/^[a-z][a-z0-9_ -]*$/.test(status)) return status;
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  const words = status.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
