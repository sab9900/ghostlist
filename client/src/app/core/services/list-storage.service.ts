import { Injectable } from '@angular/core';
import { KnownList } from '../models';

const DB_NAME = 'ghostlist-db';
const DB_VERSION = 2;
const STORE_NAME = 'known-lists';
export const PREFS_STORE = 'user-preferences';

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
            };

            req.onblocked = () => {
                // A stale connection is blocking the v1→v2 upgrade. Reject after a short
                // timeout so callers fall back gracefully instead of hanging forever.
                setTimeout(() => settle(() => {
                    this.dbPromise = null;
                    reject(new DOMException('IDB upgrade blocked by another connection', 'AbortError'));
                }), 3000);
            };

            req.onsuccess = () => settle(() => {
                const db = req.result;
                // When a newer-version request arrives, close our handle so the upgrade
                // transaction is never blocked by us.
                db.onversionchange = () => { db.close(); this.dbPromise = null; };
                resolve(db);
            });

            req.onerror = () => settle(() => {
                this.dbPromise = null; // reset so the next call retries
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
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}
