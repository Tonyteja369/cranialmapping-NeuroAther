import type { Experiment, Sample } from "./types";

const DB = "neurosensex";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("experiments", { keyPath: "id" });
      r.result.createObjectStore("datasets");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => { db.close(); res(req.result); };
        t.onerror = () => { db.close(); rej(t.error ?? req.error); };
        t.onabort = () => { db.close(); rej(t.error ?? new Error("Storage transaction aborted")); };
      }),
  );
}
export const dbListExperiments = () => tx<Experiment[]>("experiments", "readonly", (s) => s.getAll() as IDBRequest<Experiment[]>);
export const dbSaveExperiment = (e: Experiment) => tx("experiments", "readwrite", (s) => s.put(e));
export const dbDeleteExperiment = async (id: string) => {
  await tx("experiments", "readwrite", (s) => s.delete(id));
  await tx("datasets", "readwrite", (s) => s.delete(id));
};
export const dbSaveDataset = (id: string, samples: Sample[]) => tx("datasets", "readwrite", (s) => s.put(samples, id));
export const dbLoadDataset = async (id: string): Promise<Sample[] | undefined> => {
  const rows = await tx<(Sample & { t?: number; s?: Sample["sensorId"] })[] | undefined>("datasets", "readonly", (s) => s.get(id));
  // Compatibility boundary for existing five-field recordings; never rewrite their values.
  return rows?.map((row) => {
    const timestamp = row.timestamp ?? row.t;
    const sensorId = row.sensorId ?? row.s;
    if (timestamp === undefined || sensorId === undefined || ![1, 2, 3].includes(sensorId) || ![timestamp, row.ax, row.ay, row.az].every(Number.isFinite)) throw new Error("Stored dataset contains invalid samples");
    return { timestamp, sensorId, ax: row.ax, ay: row.ay, az: row.az };
  });
};

/** Metadata and raw data commit together, not as two independently successful writes. */
export async function dbSaveRecording(exp: Experiment, samples: Sample[]) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["experiments", "datasets"], "readwrite");
    transaction.objectStore("experiments").put(exp);
    transaction.objectStore("datasets").put(samples, exp.id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Recording save aborted")); };
  });
}
