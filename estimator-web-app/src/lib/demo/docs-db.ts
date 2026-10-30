/**
 * Browser-only storage for uploaded PDFs in demo mode (IndexedDB; localStorage is too small).
 * Files never leave the browser unless the user starts an AI analysis.
 */
const DB_NAME = "xlive-estimator-docs";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open browser document storage"));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("Browser document storage failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Browser document storage was aborted (storage may be full)"));
    });
  } finally {
    db.close();
  }
}

export const putDocumentFile = (id: string, file: Blob) => run("readwrite", (s) => s.put(file, id)).then(() => undefined);
export const getDocumentFile = (id: string) => run<Blob | undefined>("readonly", (s) => s.get(id));
export const deleteDocumentFile = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);
export const clearDocumentFiles = () => run("readwrite", (s) => s.clear()).then(() => undefined);

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
