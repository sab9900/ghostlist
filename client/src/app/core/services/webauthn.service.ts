import { Injectable, signal } from '@angular/core';

const DB_NAME      = 'ghostlist';
const DB_VERSION   = 1;
const STORE_NAME   = 'security';
const CREDENTIAL_KEY = 'credential_id';
const AUTO_LOCK_KEY  = 'gl_auto_lock_timeout';

export type AutoLockTimeout = 'never' | '1min' | '5min' | '10min' | '1h';

export const AUTO_LOCK_OPTIONS: { value: AutoLockTimeout; labelKey: string }[] = [
    { value: 'never',  labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.NEVER'  },
    { value: '1min',   labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.1MIN'   },
    { value: '5min',   labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.5MIN'   },
    { value: '10min',  labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.10MIN'  },
    { value: '1h',     labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.1H'     },
];

@Injectable({ providedIn: 'root' })
export class WebAuthnService {

    /** True when a credential has been registered on this device. */
    readonly isEnabled = signal<boolean>(false);

    /** How long without activity before the app locks itself. */
    readonly autoLockTimeout = signal<AutoLockTimeout>(
        (localStorage.getItem(AUTO_LOCK_KEY) as AutoLockTimeout | null) ?? 'never',
    );

    /** True when the platform supports WebAuthn (navigator.credentials + PublicKeyCredential). */
    get isSupported(): boolean {
        return (
            typeof window !== 'undefined' &&
            !!window.PublicKeyCredential &&
            typeof window.PublicKeyCredential === 'function' &&
            !!navigator.credentials
        );
    }

    /**
     * The relying-party ID.
     * On Capacitor native the WKWebView/WebView runs at "localhost",
     * which is fine for a local platform credential (not a synced passkey).
     */
    private get rpId(): string {
        return window.location.hostname || 'localhost';
    }

    // ── IndexedDB helpers ─────────────────────────────────────────────────────

    private openDb(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(STORE_NAME);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    private idbGet(db: IDBDatabase, key: string): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result as string | undefined);
            req.onerror   = () => reject(req.error);
        });
    }

    private idbPut(db: IDBDatabase, key: string, value: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }

    private idbDelete(db: IDBDatabase, key: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Load the credential state from IndexedDB and update isEnabled.
     * Must be called once during app bootstrap before checking isEnabled().
     */
    async init(): Promise<void> {
        try {
            const db = await this.openDb();
            const id = await this.idbGet(db, CREDENTIAL_KEY);
            this.isEnabled.set(!!id);
        } catch {
            this.isEnabled.set(false);
        }
    }

    /** Returns the auto-lock timeout in milliseconds, or null if set to 'never'. */
    getTimeoutMs(): number | null {
        switch (this.autoLockTimeout()) {
            case '1min':  return    60_000;
            case '5min':  return   300_000;
            case '10min': return   600_000;
            case '1h':    return 3_600_000;
            default:      return null;
        }
    }

    setAutoLockTimeout(t: AutoLockTimeout): void {
        localStorage.setItem(AUTO_LOCK_KEY, t);
        this.autoLockTimeout.set(t);
    }

    /**
     * Register a new platform credential.
     * Throws if WebAuthn is unsupported or the user cancels.
     */
    async register(): Promise<void> {
        const challenge = crypto.getRandomValues(new Uint8Array(32));

        // Fixed synthetic user ID — we have no real user accounts.
        const userId = new Uint8Array(16);
        userId[0] = 0x67; // 'g'
        userId[1] = 0x6c; // 'l'

        const cred = (await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: {
                    name: 'Ghost List',
                    id: this.rpId,
                },
                user: {
                    id: userId,
                    name: 'device-owner@ghostlist',
                    displayName: 'Device Owner',
                },
                pubKeyCredParams: [
                    { alg: -7,   type: 'public-key' },  // ES256
                    { alg: -257, type: 'public-key' },  // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    residentKey: 'preferred',
                    userVerification: 'required',
                },
                timeout: 60_000,
            },
        })) as PublicKeyCredential | null;

        if (!cred) throw new Error('WebAuthn registration returned null.');

        const b64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
        const db = await this.openDb();
        await this.idbPut(db, CREDENTIAL_KEY, b64);
        this.isEnabled.set(true);
    }

    /**
     * Assert the previously registered credential.
     * Returns true on success, false if the user cancels or authentication fails.
     */
    async authenticate(): Promise<boolean> {
        try {
            const db  = await this.openDb();
            const b64 = await this.idbGet(db, CREDENTIAL_KEY);
            if (!b64) return false;

            const challenge   = crypto.getRandomValues(new Uint8Array(32));
            const credIdBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

            const result = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    rpId: this.rpId,
                    allowCredentials: [
                        {
                            type: 'public-key',
                            id:   credIdBytes,
                            transports: ['internal'],
                        },
                    ],
                    userVerification: 'required',
                    timeout: 60_000,
                },
            });
            return result !== null;
        } catch {
            return false;
        }
    }

    /** Remove the stored credential and disable biometric lock. */
    async disable(): Promise<void> {
        try {
            const db = await this.openDb();
            await this.idbDelete(db, CREDENTIAL_KEY);
        } finally {
            this.isEnabled.set(false);
        }
    }
}
