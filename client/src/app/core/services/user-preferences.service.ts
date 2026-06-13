import { inject, Injectable, signal } from '@angular/core';
import { ListStorageService, PREFS_STORE } from './list-storage.service';

const KEY_CRYPTO_KEY  = 'prefs-crypto-key';
const KEY_SENDER_NAME = 'sender-name';
const LS_KEY          = 'gl_sender_name';
const LS_ONBOARDED_KEY = 'gl_name_onboarded';

interface EncryptedEntry { key: string; ciphertext: string; iv: string; }

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
    private readonly storage = inject(ListStorageService);

    readonly senderName = signal<string>(localStorage.getItem(LS_KEY) ?? '');

    /**
     * True once IDB hydration has completed (successfully or not). Reading
     * `senderName` for persistence decisions (e.g. registering as a list member)
     * before this is true risks acting on a stale/empty localStorage cache while
     * IDB actually holds a real value.
     */
    readonly hydrated = signal(false);

    /**
     * True once the user has responded to the first-run name onboarding dialog
     * (either saved a name or explicitly skipped it). Used to avoid persisting
     * "Anonymous" as a display name before the user has had a chance to respond.
     * Pre-existing users (who already had a sender name before this flag existed)
     * are treated as already onboarded once hydration completes.
     */
    readonly onboarded = signal<boolean>(localStorage.getItem(LS_ONBOARDED_KEY) === '1');

    private hydratedResolve!: () => void;
    private readonly hydratedPromise = new Promise<void>(resolve => { this.hydratedResolve = resolve; });

    private onboardedResolve: (() => void) | null = null;
    private onboardedPromise: Promise<void> | null = null;

    constructor() {
        void this.loadFromIdb();
    }

    /** Resolves once IDB hydration of `senderName` has completed. */
    whenHydrated(): Promise<void> {
        return this.hydratedPromise;
    }

    /** Resolves once the user has responded to the first-run name dialog (or already had). */
    whenOnboarded(): Promise<void> {
        if (this.onboarded()) return Promise.resolve();
        this.onboardedPromise ??= new Promise(resolve => { this.onboardedResolve = resolve; });
        return this.onboardedPromise;
    }

    /** Marks the first-run name dialog as resolved (name saved or explicitly skipped). */
    markOnboarded(): void {
        if (this.onboarded()) return;
        this.onboarded.set(true);
        localStorage.setItem(LS_ONBOARDED_KEY, '1');
        this.onboardedResolve?.();
        this.onboardedResolve = null;
    }

    setSenderName(name: string): void {
        const trimmed = name.trim();
        this.senderName.set(trimmed);
        localStorage.setItem(LS_KEY, trimmed);
        void this.saveToIdb(trimmed);
        if (trimmed) this.markOnboarded();
    }

    private async loadFromIdb(): Promise<void> {
        try {
            const db     = await this.storage.getDb();
            const encKey = await this.getOrCreateKey(db);
            const stored = await this.idbGet<EncryptedEntry>(db, KEY_SENDER_NAME);
            if (!stored) {
                const existing = localStorage.getItem(LS_KEY);
                if (existing) await this.saveToIdb(existing);
                return;
            }
            const plain = await this.decrypt(stored.ciphertext, stored.iv, encKey);
            this.senderName.set(plain);
            localStorage.setItem(LS_KEY, plain);
        } catch { }
        finally {
            // Pre-existing users who already had a name before onboarding tracking
            // existed shouldn't see the first-run dialog.
            if (this.senderName() && !this.onboarded()) {
                this.markOnboarded();
            }
            this.hydrated.set(true);
            this.hydratedResolve();
        }
    }

    private async saveToIdb(name: string): Promise<void> {
        try {
            const db     = await this.storage.getDb();
            const encKey = await this.getOrCreateKey(db);
            const { ciphertext, iv } = await this.encrypt(name, encKey);
            await this.idbPut<EncryptedEntry>(db, { key: KEY_SENDER_NAME, ciphertext, iv });
        } catch { }
    }

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
