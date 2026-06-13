import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

const DB_NAME        = 'ghostlist';
const DB_VERSION     = 1;
const STORE_NAME     = 'security';
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

    readonly isEnabled = signal<boolean>(false);

    readonly isSupported = signal<boolean>(false);

    readonly autoLockTimeout = signal<AutoLockTimeout>(
        (localStorage.getItem(AUTO_LOCK_KEY) as AutoLockTimeout | null) ?? 'never',
    );

    private get isNative(): boolean {
        return Capacitor.isNativePlatform();
    }

    private get rpId(): string {
        return window.location.hostname || 'localhost';
    }

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

    async init(): Promise<void> {
        if (this.isNative) {
            try {
                const { isAvailable } = await BiometricAuth.checkBiometry();
                this.isSupported.set(isAvailable);
            } catch {
                this.isSupported.set(false);
            }
        } else {
            this.isSupported.set(
                typeof window !== 'undefined' &&
                !!window.PublicKeyCredential &&
                typeof window.PublicKeyCredential === 'function' &&
                !!navigator.credentials,
            );
        }

        try {
            const db  = await this.openDb();
            const val = await this.idbGet(db, CREDENTIAL_KEY);
            this.isEnabled.set(!!val);
        } catch {
            this.isEnabled.set(false);
        }
    }

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

    async register(): Promise<void> {
        if (this.isNative) {
            await BiometricAuth.authenticate({ reason: 'Enable biometric lock' });
            const db = await this.openDb();
            await this.idbPut(db, CREDENTIAL_KEY, 'native');
            this.isEnabled.set(true);
            return;
        }

        const challenge = crypto.getRandomValues(new Uint8Array(32));

        const userId = new Uint8Array(16);
        userId[0] = 0x67;
        userId[1] = 0x6c;

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
                    { alg: -7, type: 'public-key' },
                    { alg: -257, type: 'public-key' },
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
        const db  = await this.openDb();
        await this.idbPut(db, CREDENTIAL_KEY, b64);
        this.isEnabled.set(true);
    }

    async authenticate(): Promise<boolean> {
        if (this.isNative) {
            try {
                await BiometricAuth.authenticate({ reason: 'Unlock Ghost List' });
                return true;
            } catch {
                return false;
            }
        }

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

    async disable(): Promise<void> {
        try {
            const db = await this.openDb();
            await this.idbDelete(db, CREDENTIAL_KEY);
        } finally {
            this.isEnabled.set(false);
        }
    }
}
