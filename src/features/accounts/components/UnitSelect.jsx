import { Select } from "../../../components/Select.jsx";
import { unitChoices } from "../model/inventoryModel.js";

export function UnitSelect({ value, onValue, label = "Unit" }) {
  const units = unitChoices(value);
  const selected = units.includes(value) ? value : (value || "Nos");
  return (
    <Select aria-label={label} value={selected} onChange={event => onValue(event.target.value)}>
      {units.map(unit => <option key={unit} value={unit}>{unit}</option>)}
    </Select>
  );
}
