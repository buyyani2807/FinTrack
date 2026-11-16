import { money } from "../../accountsFormat.js";

const RATE_UNIT = { daily: "a day", hourly: "an hour" };

// "₹24,000" for a monthly salary, "₹600 a day" for a wage.
export function payLabel(row) {
  if (!(Number(row?.monthly) > 0)) return "Not set";
  const type = row.payType || "monthly";
  return type === "monthly" ? money(row.monthly) : `${money(row.monthly)} ${RATE_UNIT[type] || ""}`.trim();
}
