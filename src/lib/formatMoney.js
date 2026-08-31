export function formatInr(value, prefix = "₹") {
  const n = Number(value || 0);
  const paise = Math.abs(Math.round(n * 100) % 100);
  return `${prefix}${n.toLocaleString("en-IN", {
    minimumFractionDigits: paise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
