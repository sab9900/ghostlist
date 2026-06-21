import { inject, Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ListStorageService, PREFS_STORE } from './list-storage.service';

const KEY_CRYPTO_KEY  = 'prefs-crypto-key';
const KEY_SENDER_NAME = 'sender-name';
const LS_KEY          = 'gl_sender_name';
const LS_ONBOARDED_KEY = 'gl_name_onboarded';
const LS_HAPTICS_KEY  = 'gl_haptics_enabled';
const LS_NOTIF_ENABLED_KEY = 'gl_notif_enabled';
const LS_NOTIF_PROMPTED_KEY = 'gl_notif_prompted';
const LS_CAMERA_FACING_KEY = 'gl_video_camera_facing';

const DEFAULT_HAPTICS_ENABLED = Capacitor.getPlatform() === 'ios';

interface EncryptedEntry { key: string; ciphertext: string; iv: string; }

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
    private readonly storage = inject(ListStorageService);

    readonly senderName = signal<string>(localStorage.getItem(LS_KEY) ?? '');

    readonly hydrated = signal(false);

    readonly onboarded = signal<boolean>(localStorage.getItem(LS_ONBOARDED_KEY) === '1');

    private hydratedResolve!: () => void;
    private readonly hydratedPromise = new Promise<void>(resolve => { this.hydratedResolve = resolve; });

    private onboardedResolve: (() => void) | null = null;
    private onboardedPromise: Promise<void> | null = null;

    constructor() {
        void this.loadFromIdb();
    }

    whenHydrated(): Promise<void> {
        return this.hydratedPromise;
    }

    whenOnboarded(): Promise<void> {
        if (this.onboarded()) return Promise.resolve();
        this.onboardedPromise ??= new Promise(resolve => { this.onboardedResolve = resolve; });
        return this.onboardedPromise;
    }

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

    readonly hapticsEnabled = signal<boolean>(
        ((): boolean => {
            const stored = localStorage.getItem(LS_HAPTICS_KEY);
            return stored !== null ? stored === '1' : DEFAULT_HAPTICS_ENABLED;
        })(),
    );

    setHapticsEnabled(enabled: boolean): void {
        this.hapticsEnabled.set(enabled);
        localStorage.setItem(LS_HAPTICS_KEY, enabled ? '1' : '0');
    }

    /** Whether the user has opted in to push notifications (soft toggle, independent of browser permission). */
    readonly notificationsEnabled = signal<boolean>(
        localStorage.getItem(LS_NOTIF_ENABLED_KEY) === '1',
    );

    setNotificationsEnabled(enabled: boolean): void {
        this.notificationsEnabled.set(enabled);
        localStorage.setItem(LS_NOTIF_ENABLED_KEY, enabled ? '1' : '0');
    }

    /** Whether we've already shown the notification onboarding dialog once. */
    readonly notifPrompted = signal<boolean>(
        localStorage.getItem(LS_NOTIF_PROMPTED_KEY) === '1',
    );

    markNotifPrompted(): void {
        this.notifPrompted.set(true);
        localStorage.setItem(LS_NOTIF_PROMPTED_KEY, '1');
    }

    /** Which camera (front/back) video recording should default to next time. */
    readonly preferredCameraFacing = signal<'user' | 'environment'>(
        localStorage.getItem(LS_CAMERA_FACING_KEY) === 'environment' ? 'environment' : 'user',
    );

    setPreferredCameraFacing(facing: 'user' | 'environment'): void {
        if (this.preferredCameraFacing() === facing) return;
        this.preferredCameraFacing.set(facing);
        localStorage.setItem(LS_CAMERA_FACING_KEY, facing);
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
