import { Injectable } from '@angular/core';
import { CachedList, KnownList, PendingOperation } from '../models';

const DB_NAME = 'ghostlist-db';
const DB_VERSION = 3;
const STORE_NAME = 'known-lists';
export const PREFS_STORE = 'user-preferences';
const LIST_CACHE_STORE = 'list-cache';
const PENDING_OPS_STORE = 'pending-ops';

@Injectable({ providedIn: 'root' })
export class ListStorageService {
    private dbPromise: Promise<IDBDatabase> | null = null;

    getDb(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            let settled = false;

            const settle = (fn: () => void) => {
                if (settled) return;
                settled = true;
                fn();
            };

            req.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(PREFS_STORE)) {
                    db.createObjectStore(PREFS_STORE, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(LIST_CACHE_STORE)) {
                    db.createObjectStore(LIST_CACHE_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(PENDING_OPS_STORE)) {
                    db.createObjectStore(PENDING_OPS_STORE, { keyPath: 'localId', autoIncrement: true });
                }
            };

            req.onblocked = () => {
                setTimeout(() => settle(() => {
                    this.dbPromise = null;
                    reject(new DOMException('IDB upgrade blocked by another connection', 'AbortError'));
                }), 3000);
            };

            req.onsuccess = () => settle(() => {
                const db = req.result;
                db.onversionchange = () => { db.close(); this.dbPromise = null; };
                resolve(db);
            });

            req.onerror = () => settle(() => {
                this.dbPromise = null;
                reject(req.error);
            });
        });

        return this.dbPromise;
    }

    async getAll(): Promise<KnownList[]> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
            req.onsuccess = () => resolve(req.result as KnownList[]);
            req.onerror = () => reject(req.error);
        });
    }

    async upsert(list: KnownList): Promise<void> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(list);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async remove(id: string): Promise<void> {
        const db = await this.getDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        await this.removeListCache(id);
    }

    // --- Offline list cache (items + chat messages per list) ---

    async getListCache(id: string): Promise<CachedList | undefined> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const req = db.transaction(LIST_CACHE_STORE, 'readonly').objectStore(LIST_CACHE_STORE).get(id);
            req.onsuccess = () => resolve(req.result as CachedList | undefined);
            req.onerror = () => reject(req.error);
        });
    }

    async putListCache(cache: CachedList): Promise<void> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(LIST_CACHE_STORE, 'readwrite');
            tx.objectStore(LIST_CACHE_STORE).put(cache);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async removeListCache(id: string): Promise<void> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(LIST_CACHE_STORE, 'readwrite');
            tx.objectStore(LIST_CACHE_STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // --- Pending offline operations queue ---

    async getPendingOps(): Promise<PendingOperation[]> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const req = db.transaction(PENDING_OPS_STORE, 'readonly').objectStore(PENDING_OPS_STORE).getAll();
            req.onsuccess = () => resolve(req.result as PendingOperation[]);
            req.onerror = () => reject(req.error);
        });
    }

    async addPendingOp(op: PendingOperation): Promise<number> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PENDING_OPS_STORE, 'readwrite');
            const req = tx.objectStore(PENDING_OPS_STORE).add(op);
            req.onsuccess = () => resolve(req.result as number);
            req.onerror = () => reject(req.error);
        });
    }

    async removePendingOp(localId: number): Promise<void> {
        const db = await this.getDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PENDING_OPS_STORE, 'readwrite');
            tx.objectStore(PENDING_OPS_STORE).delete(localId);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}
