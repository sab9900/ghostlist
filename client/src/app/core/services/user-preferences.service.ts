import { inject, Injectable, signal } from '@angular/core';
import { ListStorageService, PREFS_STORE } from './list-storage.service';

const KEY_CRYPTO_KEY  = 'prefs-crypto-key';
const KEY_SENDER_NAME = 'sender-name';
const LS_KEY          = 'gl_sender_name';

interface EncryptedEntry { key: string; ciphertext: string; iv: string; }

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
    private readonly storage = inject(ListStorageService);

    /**
     * Synchronous initial value from localStorage so the UI is never blank on load.
     * IDB holds an encrypted copy as the authoritative store; on load it syncs back
     * to localStorage so the next refresh is also instant.
     */
    readonly senderName = signal<string>(localStorage.getItem(LS_KEY) ?? '');

    constructor() {
        // Self-initializing — does not block app startup.
        void this.loadFromIdb();
    }

    setSenderName(name: string): void {
        const trimmed = name.trim();
        this.senderName.set(trimmed);
        localStorage.setItem(LS_KEY, trimmed);   // instant sync fallback
        void this.saveToIdb(trimmed);            // encrypted async write
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private async loadFromIdb(): Promise<void> {
        try {
            const db     = await this.storage.getDb();
            const encKey = await this.getOrCreateKey(db);
            const stored = await this.idbGet<EncryptedEntry>(db, KEY_SENDER_NAME);
            if (!stored) {
                // First run: encrypt whatever is already in localStorage.
                const existing = localStorage.getItem(LS_KEY);
                if (existing) await this.saveToIdb(existing);
                return;
            }
            const plain = await this.decrypt(stored.ciphertext, stored.iv, encKey);
            // Update signal and keep localStorage in sync so next refresh is instant.
            this.senderName.set(plain);
            localStorage.setItem(LS_KEY, plain);
        } catch { /* IDB unavailable — localStorage remains the sole source */ }
    }

    private async saveToIdb(name: string): Promise<void> {
        try {
            const db     = await this.storage.getDb();
            const encKey = await this.getOrCreateKey(db);
            const { ciphertext, iv } = await this.encrypt(name, encKey);
            await this.idbPut<EncryptedEntry>(db, { key: KEY_SENDER_NAME, ciphertext, iv });
        } catch { /* IDB unavailable — localStorage fallback is already written */ }
    }

    /**
     * Non-extractable AES-GCM key stored as a CryptoKey object in IDB.
     * Raw bytes are never exposed to JavaScript.
     */
    private async getOrCreateKey(db: IDBDatabase): Promise<CryptoKey> {
        const existing = await this.idbGet<{ key: string; value: CryptoKey }>(db, KEY_CRYPTO_KEY);
        if (existing?.value) return existing.value;

        const newKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt'],
        );
        await this.idbPut(db, { key: KEY_CRYPTO_KEY, value: newKey });
        return newKey;
    }

    private async encrypt(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
        const iv  = crypto.getRandomValues(new Uint8Array(12));
        const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
        return { ciphertext: this.b64(buf), iv: this.b64(iv) };
    }

    private async decrypt(ciphertextB64: string, ivB64: string, key: CryptoKey): Promise<string> {
        const buf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: this.unb64(ivB64) },
            key,
            this.unb64(ciphertextB64),
        );
        return new TextDecoder().decode(buf);
    }

    private idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            const req = db.transaction(PREFS_STORE, 'readonly').objectStore(PREFS_STORE).get(key);
            req.onsuccess = () => resolve(req.result as T | undefined);
            req.onerror   = () => reject(req.error);
        });
    }

    private idbPut<T>(db: IDBDatabase, value: T): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(PREFS_STORE, 'readwrite');
            tx.objectStore(PREFS_STORE).put(value);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        });
    }

    private b64(buf: ArrayBuffer | Uint8Array): string {
        const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return btoa(s);
    }

    private unb64(s: string): Uint8Array<ArrayBuffer> {
        const bin = atob(s);
        const buf = new ArrayBuffer(bin.length);
        const b   = new Uint8Array(buf);
        for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
        return b;
    }
}
