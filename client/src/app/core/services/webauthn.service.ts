import { inject, Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { RawWrappedVaultKey, VaultKeyService } from './vault-key.service';
import { PrefsCacheService } from './prefs-cache.service';

const DB_NAME        = 'ghostlist';
const DB_VERSION     = 1;
const STORE_NAME     = 'security';
const CREDENTIAL_KEY = 'credential_id';
const VAULT_WRAP_KEY = 'vault_biometric_wrap';
const PRF_SALT_KEY   = 'prf_salt';
const BGS_KEY        = 'biometric_guard_secret';
const AUTO_LOCK_KEY  = 'gl_auto_lock_timeout';

export type AutoLockTimeout = 'never' | '1min' | '5min' | '10min' | '1h';

export const AUTO_LOCK_OPTIONS: { value: AutoLockTimeout; labelKey: string }[] = [
    { value: 'never',  labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.NEVER'  },
    { value: '1min',   labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.1MIN'   },
    { value: '5min',   labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.5MIN'   },
    { value: '10min',  labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.10MIN'  },
    { value: '1h',     labelKey: 'SETTINGS.SECURITY.AUTO_LOCK.1H'     },
];

export class PrfUnsupportedError extends Error {
    constructor() {
        super('This browser/authenticator does not support deriving a real secret (WebAuthn PRF). Use your master password instead.');
    }
}

interface PrfExtensionResults {
    prf?: {
        enabled?: boolean;
        results?: { first?: ArrayBuffer };
    };
}

@Injectable({ providedIn: 'root' })
export class WebAuthnService {
    private readonly vaultKey = inject(VaultKeyService);
    private readonly prefsCache = inject(PrefsCacheService);

    readonly isEnabled = signal<boolean>(false);

    readonly isSupported = signal<boolean>(false);

    /** Flips true once init() has resolved isEnabled/isSupported from IndexedDB — lets callers (e.g. the loading overlay) wait out the same async read the lock screen depends on. */
    readonly ready = signal<boolean>(false);

    readonly autoLockTimeout = signal<AutoLockTimeout>(
        this.prefsCache.get<AutoLockTimeout>(AUTO_LOCK_KEY, 'never'),
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
        try {
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
                if (!val) {
                    this.isEnabled.set(false);
                    return;
                }

                const wrap = await this.idbGet(db, VAULT_WRAP_KEY);
                if (!wrap) {
                    // Biometric lock was enabled by a version of the app that had no real
                    // key material behind it (the original cosmetic-only lock). There is
                    // nothing for it to unlock, so disable it rather than leaving the
                    // person stuck behind a biometric prompt that can never succeed.
                    await this.idbDelete(db, CREDENTIAL_KEY).catch(() => { });
                    await this.idbDelete(db, PRF_SALT_KEY).catch(() => { });
                    this.isEnabled.set(false);
                    return;
                }

                this.isEnabled.set(true);
            } catch {
                this.isEnabled.set(false);
            }
        } finally {
            this.ready.set(true);
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
        this.prefsCache.set(AUTO_LOCK_KEY, t);
        this.autoLockTimeout.set(t);
    }

    /**
     * Wraps the *currently unlocked* vault key under a biometric-derived secret.
     * Callers must ensure the vault is unlocked (e.g. via a fresh master password
     * check) before calling this — biometric unlock is always a convenience layer
     * on top of the password, never a replacement for it.
     */
    async register(): Promise<void> {
        if (!this.vaultKey.isUnlocked()) {
            throw new Error('Vault must be unlocked before enabling biometric unlock.');
        }

        if (this.isNative) {
            await BiometricAuth.authenticate({ reason: 'Enable biometric lock' });
            const secret = this.vaultKey.generateRawSecret();
            const wrapped = await this.vaultKey.wrapVaultKeyWithRawSecret(secret);

            await SecureStorage.set(BGS_KEY, this.bufToB64(secret));
            const db = await this.openDb();
            await this.idbPut(db, VAULT_WRAP_KEY, JSON.stringify(wrapped));
            await this.idbPut(db, CREDENTIAL_KEY, 'native');
            this.isEnabled.set(true);
            return;
        }

        const prfSalt = crypto.getRandomValues(new Uint8Array(32));
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
                extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
                timeout: 60_000,
            },
        })) as PublicKeyCredential | null;

        if (!cred) throw new Error('WebAuthn registration returned null.');

        const extResults = cred.getClientExtensionResults() as PrfExtensionResults;
        if (!extResults.prf?.enabled) {
            throw new PrfUnsupportedError();
        }

        const secretBuf = extResults.prf.results?.first ?? await this.evalPrfViaGet(cred.rawId, prfSalt);
        const secret = new Uint8Array(secretBuf);
        const wrapped = await this.vaultKey.wrapVaultKeyWithRawSecret(secret);

        const b64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
        const db  = await this.openDb();
        await this.idbPut(db, CREDENTIAL_KEY, b64);
        await this.idbPut(db, PRF_SALT_KEY, this.bufToB64(prfSalt));
        await this.idbPut(db, VAULT_WRAP_KEY, JSON.stringify(wrapped));
        this.isEnabled.set(true);
    }

    private async evalPrfViaGet(credIdBytes: ArrayBuffer, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const result = (await navigator.credentials.get({
            publicKey: {
                challenge,
                rpId: this.rpId,
                allowCredentials: [{ type: 'public-key', id: credIdBytes, transports: ['internal'] }],
                userVerification: 'required',
                extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
                timeout: 60_000,
            },
        })) as PublicKeyCredential | null;
        if (!result) throw new Error('PRF evaluation failed.');
        const ext = result.getClientExtensionResults() as PrfExtensionResults;
        const buf = ext.prf?.results?.first;
        if (!buf) throw new PrfUnsupportedError();
        return buf;
    }

    async authenticate(): Promise<boolean> {
        if (this.isNative) {
            try {
                await BiometricAuth.authenticate({ reason: 'Unlock Ghost List' });
                const secretB64 = await SecureStorage.get(BGS_KEY) as string | null;
                if (!secretB64) return false;

                const db = await this.openDb();
                const wrappedRaw = await this.idbGet(db, VAULT_WRAP_KEY);
                if (!wrappedRaw) return false;

                const secret = this.b64ToBuf(secretB64);
                const wrapped = JSON.parse(wrappedRaw) as RawWrappedVaultKey;
                return await this.vaultKey.unwrapVaultKeyWithRawSecret(secret, wrapped);
            } catch {
                return false;
            }
        }

        try {
            const db = await this.openDb();
            const b64        = await this.idbGet(db, CREDENTIAL_KEY);
            const saltB64     = await this.idbGet(db, PRF_SALT_KEY);
            const wrappedRaw  = await this.idbGet(db, VAULT_WRAP_KEY);
            if (!b64 || !saltB64 || !wrappedRaw) return false;

            const challenge    = crypto.getRandomValues(new Uint8Array(32));
            const credIdBytes  = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const salt         = this.b64ToBuf(saltB64);

            const result = (await navigator.credentials.get({
                publicKey: {
                    challenge,
                    rpId: this.rpId,
                    allowCredentials: [
                        { type: 'public-key', id: credIdBytes, transports: ['internal'] },
                    ],
                    userVerification: 'required',
                    extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
                    timeout: 60_000,
                },
            })) as PublicKeyCredential | null;
            if (!result) return false;

            const ext = result.getClientExtensionResults() as PrfExtensionResults;
            const secretBuf = ext.prf?.results?.first;
            if (!secretBuf) return false;

            const wrapped = JSON.parse(wrappedRaw) as RawWrappedVaultKey;
            return await this.vaultKey.unwrapVaultKeyWithRawSecret(new Uint8Array(secretBuf), wrapped);
        } catch {
            return false;
        }
    }

    async disable(): Promise<void> {
        try {
            const db = await this.openDb();
            await this.idbDelete(db, CREDENTIAL_KEY);
            await this.idbDelete(db, VAULT_WRAP_KEY);
            await this.idbDelete(db, PRF_SALT_KEY);
            if (this.isNative) {
                try { await SecureStorage.remove(BGS_KEY); } catch { }
            }
        } finally {
            this.isEnabled.set(false);
        }
    }

    private bufToB64(buf: ArrayBuffer | Uint8Array): string {
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    private b64ToBuf(s: string): Uint8Array<ArrayBuffer> {
        const bin = atob(s);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf;
    }
}
