/** IndexedDB persistence for Counter offline catalog cache + bill queue. */
const DB_NAME = "fintrack-counter-offline-v1";
const DB_VERSION = 1;
const STORE_META = "meta";
const STORE_BILLS = "bills";

function openDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("Could not open offline store."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_BILLS)) {
        const bills = db.createObjectStore(STORE_BILLS, { keyPath: "id" });
        bills.createIndex("companyId", "companyId", { unique: false });
        bills.createIndex("syncStatus", "syncStatus", { unique: false });
      }
    };
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Offline store transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("Offline store transaction aborted."));
  });
}

function catalogKey(companyId) {
  return `catalog:${companyId || "none"}`;
}

export async function saveCounterCatalogCache(companyId, snapshot = {}) {
  if (!companyId) return;
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readwrite");
  tx.objectStore(STORE_META).put({
    key: catalogKey(companyId),
    companyId,
    syncedAt: new Date().toISOString(),
    items: snapshot.items || [],
    accounts: snapshot.accounts || [],
    priceLists: snapshot.priceLists || [],
    company: snapshot.company || null,
    counterSettings: snapshot.counterSettings || null,
  });
  await txDone(tx);
  db.close();
}

export async function loadCounterCatalogCache(companyId) {
  if (!companyId) return null;
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readonly");
  const request = tx.objectStore(STORE_META).get(catalogKey(companyId));
  const row = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return row;
}

export async function listOfflineBills(companyId) {
  if (!companyId) return [];
  const db = await openDb();
  const tx = db.transaction(STORE_BILLS, "readonly");
  const index = tx.objectStore(STORE_BILLS).index("companyId");
  const request = index.getAll(companyId);
  const rows = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return (rows || []).slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

export async function putOfflineBill(bill) {
  if (!bill?.id || !bill?.companyId) throw new Error("Offline bill is missing id or company.");
  const db = await openDb();
  const tx = db.transaction(STORE_BILLS, "readwrite");
  tx.objectStore(STORE_BILLS).put(bill);
  await txDone(tx);
  db.close();
  return bill;
}

export async function patchOfflineBill(id, patch = {}) {
  if (!id) return null;
  const db = await openDb();
  const tx = db.transaction(STORE_BILLS, "readwrite");
  const store = tx.objectStore(STORE_BILLS);
  const current = await new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  if (!current) {
    await txDone(tx);
    db.close();
    return null;
  }
  const next = { ...current, ...patch, id: current.id, companyId: current.companyId };
  store.put(next);
  await txDone(tx);
  db.close();
  return next;
}

export async function deleteOfflineBill(id) {
  if (!id) return;
  const db = await openDb();
  const tx = db.transaction(STORE_BILLS, "readwrite");
  tx.objectStore(STORE_BILLS).delete(id);
  await txDone(tx);
  db.close();
}
