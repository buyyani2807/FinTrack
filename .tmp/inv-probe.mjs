import { DEBUG as d } from "./capture-data.mjs";
import { buildInventoryForecast } from "../src/features/intelligence/ai/inventoryForecast.js";
const items = d.ITEMS.map(r => ({ id: r.id, itemType: r.item_type, name: r.name, isActive: true, openingStock: r.opening_stock, openingStockDate: r.opening_stock_date, reorderLevel: r.reorder_level, unit: r.unit }));
const moves = d.MOVES.map(r => ({ id: r.id, itemId: r.item_id, movementDate: r.movement_date, quantityDelta: r.quantity_delta, reason: r.reason, createdAt: r.created_at }));
const t = Date.now();
const out = buildInventoryForecast({ items, stockMovements: moves, tradeDocuments: [], asOf: "2026-09-30" });
console.log(Date.now() - t, "ms", JSON.stringify(out).slice(0, 600));
