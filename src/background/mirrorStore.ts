import type { NetworkMirrorPayload } from '@/shared/types';

const DB_NAME = 'offlineCaptureMirror';
const DB_VERSION = 1;
const STORE_NAME = 'mirrorRecords';
const PAGE_INDEX = 'pageId';

let dbPromise: Promise<IDBDatabase> | undefined;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex(PAGE_INDEX, 'pageId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open mirror database.'));
    });
  }

  return dbPromise;
}

export async function saveMirrorPayload(payload: NetworkMirrorPayload): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(payload);
  await transactionToPromise(transaction);
}

export async function getMirrorPayload(id: string): Promise<NetworkMirrorPayload | undefined> {
  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const request = transaction.objectStore(STORE_NAME).get(id);
  const result = await requestToPromise(request);
  await transactionToPromise(transaction);
  return result ?? undefined;
}

export async function listMirrorPayloadsByPage(pageId: string): Promise<NetworkMirrorPayload[]> {
  const db = await openDb();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const index = transaction.objectStore(STORE_NAME).index(PAGE_INDEX);
  const request = index.getAll(pageId);
  const records = (await requestToPromise(request)) ?? [];
  await transactionToPromise(transaction);
  return records.sort((left, right) => {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
    return left.capturedAt - right.capturedAt;
  });
}
