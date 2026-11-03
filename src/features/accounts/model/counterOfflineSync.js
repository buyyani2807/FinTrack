/** Sync pending Counter offline bills into Accounts via the normal sale post path. */
import { postVoucher } from "../data/accountingRepository.js";
import { listOfflineBills, patchOfflineBill } from "../data/counterOfflineStore.js";
import { pendingOfflineBills } from "./counterOffline.js";

/**
 * Posts pending/error offline bills oldest-first.
 * Uses each bill's stored payload + id as clientRequestId (idempotent).
 */
export async function syncOfflineCounterBills({ token, companyId, onProgress = null } = {}) {
  if (!token || !companyId) return { synced: [], failed: [] };
  const all = await listOfflineBills(companyId);
  const queue = pendingOfflineBills(all).filter(bill => bill.syncStatus !== "syncing");
  const synced = [];
  const failed = [];

  for (const bill of queue) {
    onProgress?.({ phase: "syncing", bill });
    await patchOfflineBill(bill.id, { syncStatus: "syncing", syncError: "" });
    try {
      const payload = {
        ...(bill.payload || {}),
        clientRequestId: bill.id,
        sourceModule: "accounts",
        sourceType: "pos_counter",
      };
      if (!payload.voucherType || !payload.lines?.length) {
        throw new Error("This offline bill is incomplete and cannot sync.");
      }
      const voucherId = await postVoucher(token, payload);
      const updated = await patchOfflineBill(bill.id, {
        syncStatus: "synced",
        syncError: "",
        voucherId,
        syncedAt: new Date().toISOString(),
      });
      synced.push(updated || { ...bill, voucherId, syncStatus: "synced" });
      onProgress?.({ phase: "synced", bill: updated, voucherId });
    } catch (err) {
      const message = err?.message || "Could not sync this offline bill.";
      const updated = await patchOfflineBill(bill.id, {
        syncStatus: "error",
        syncError: message,
      });
      failed.push({ bill: updated || bill, error: message });
      onProgress?.({ phase: "error", bill: updated || bill, error: message });
      // Stop on first hard failure so order stays FIFO; cashier can retry.
      break;
    }
  }

  return { synced, failed };
}
