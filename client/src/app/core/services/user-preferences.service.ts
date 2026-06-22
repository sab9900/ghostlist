import { inject, Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ListStorageService, PREFS_STORE } from './list-storage.service';
import { PrefsCacheService } from './prefs-cache.service';

const KEY_CRYPTO_KEY  = 'prefs-crypto-key';
const KEY_SENDER_NAME = 'sender-name';
const LEGACY_SENDER_NAME_KEY = 'gl_sender_name';
const LEGAL_CONSENT_KEY   = 'gl_legal_consent';
const ONBOARDED_KEY       = 'gl_name_onboarded';
const HAPTICS_KEY         = 'gl_haptics_enabled';
const NOTIF_ENABLED_KEY   = 'gl_notif_enabled';
const NOTIF_PROMPTED_KEY  = 'gl_notif_prompted';
const CAMERA_FACING_KEY   = 'gl_video_camera_facing';
const GHOST_MIST_KEY      = 'gl_ghost_mist_mode';
const LIST_SORT_KEY       = 'gl_list_sort_order';

const DEFAULT_HAPTICS_ENABLED = Capacitor.getPlatform() === 'ios';

export type GhostMistMode = 'off' | 'idle-3s' | 'idle-10s' | 'always';
export type ListSortOrder = 'name' | 'recent';

interface EncryptedEntry { key: string; ciphertext: string; iv: string; }

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
    private readonly storage = inject(ListStorageService);
    private readonly prefsCache = inject(PrefsCacheService);

    readonly senderName = signal<string>('');

    readonly hydrated = signal(false);

    readonly consentAccepted = signal<boolean>(this.prefsCache.get(LEGAL_CONSENT_KEY, false));

    readonly onboarded = signal<boolean>(this.prefsCache.get(ONBOARDED_KEY, false));

    private hydratedResolve!: () => void;
    private readonly hydratedPromise = new Promise<void>(resolve => { this.hydratedResolve = resolve; });

    private onboardedResolve: (() => void) | null = null;
    private onboardedPromise: Promise<void> | null = null;

    constructor() {
        void this.prefsCache.ready().then(() => this.applyCache());
        void this.loadFromIdb();
    }

    private applyCache(): void {
        this.consentAccepted.set(this.prefsCache.get(LEGAL_CONSENT_KEY, false));
        this.ghostMistMode.set(this.prefsCache.get<GhostMistMode>(GHOST_MIST_KEY, 'idle-3s'));
        this.hapticsEnabled.set(this.prefsCache.get(HAPTICS_KEY, DEFAULT_HAPTICS_ENABLED));
        this.notificationsEnabled.set(this.prefsCache.get(NOTIF_ENABLED_KEY, false));
        this.notifPrompted.set(this.prefsCache.get(NOTIF_PROMPTED_KEY, false));
        this.preferredCameraFacing.set(this.prefsCache.get<'user' | 'environment'>(CAMERA_FACING_KEY, 'user'));
        this.listSortOrder.set(this.prefsCache.get<ListSortOrder>(LIST_SORT_KEY, 'name'));
        if (!this.onboarded()) {
            this.onboarded.set(this.prefsCache.get(ONBOARDED_KEY, false));
        }
    }

    whenHydrated(): Promise<void> {
        return this.hydratedPromise;
    }

    whenOnboarded(): Promise<void> {
        if (this.onboarded()) return Promise.resolve();
        this.onboardedPromise ??= new Promise(resolve => { this.onboardedResolve = resolve; });
        return this.onboardedPromise;
    }

    markConsentAccepted(): void {
        if (this.consentAccepted()) return;
        this.consentAccepted.set(true);
        this.prefsCache.set(LEGAL_CONSENT_KEY, true);
    }

    markOnboarded(): void {
        if (this.onboarded()) return;
        this.onboarded.set(true);
        this.prefsCache.set(ONBOARDED_KEY, true);
        this.onboardedResolve?.();
        this.onboardedResolve = null;
    }

    setSenderName(name: string): void {
        const trimmed = name.trim();
        this.senderName.set(trimmed);
        void this.saveToIdb(trimmed);
        if (trimmed) this.markOnboarded();
    }

    readonly hapticsEnabled = signal<boolean>(
        this.prefsCache.get(HAPTICS_KEY, DEFAULT_HAPTICS_ENABLED),
    );

    setHapticsEnabled(enabled: boolean): void {
        this.hapticsEnabled.set(enabled);
        this.prefsCache.set(HAPTICS_KEY, enabled);
    }

    /** Whether the user has opted in to push notifications (soft toggle, independent of browser permission). */
    readonly notificationsEnabled = signal<boolean>(
        this.prefsCache.get(NOTIF_ENABLED_KEY, false),
    );

    setNotificationsEnabled(enabled: boolean): void {
        this.notificationsEnabled.set(enabled);
        this.prefsCache.set(NOTIF_ENABLED_KEY, enabled);
    }

    /** Whether we've already shown the notification onboarding dialog once. */
    readonly notifPrompted = signal<boolean>(
        this.prefsCache.get(NOTIF_PROMPTED_KEY, false),
    );

    markNotifPrompted(): void {
        this.notifPrompted.set(true);
        this.prefsCache.set(NOTIF_PROMPTED_KEY, true);
    }

    /** Which camera (front/back) video recording should default to next time. */
    readonly preferredCameraFacing = signal<'user' | 'environment'>(
        this.prefsCache.get<'user' | 'environment'>(CAMERA_FACING_KEY, 'user'),
    );

    setPreferredCameraFacing(facing: 'user' | 'environment'): void {
        if (this.preferredCameraFacing() === facing) return;
        this.preferredCameraFacing.set(facing);
        this.prefsCache.set(CAMERA_FACING_KEY, facing);
    }

    /** When/how the drifting ghost-mist background animation shows on the lists page. 'idle-3s' by default. */
    readonly ghostMistMode = signal<GhostMistMode>(
        this.prefsCache.get<GhostMistMode>(GHOST_MIST_KEY, 'idle-3s'),
    );

    setGhostMistMode(mode: GhostMistMode): void {
        this.ghostMistMode.set(mode);
        this.prefsCache.set(GHOST_MIST_KEY, mode);
    }

    /** How the lists screen orders the list cards. 'name' by default. */
    readonly listSortOrder = signal<ListSortOrder>(
        this.prefsCache.get<ListSortOrder>(LIST_SORT_KEY, 'name'),
    );

    setListSortOrder(order: ListSortOrder): void {
        if (this.listSortOrder() === order) return;
        this.listSortOrder.set(order);
        this.prefsCache.set(LIST_SORT_KEY, order);
    }

    private async loadFromIdb(): Promise<void> {
        try {
            const db     = await this.storage.getDb();
            const encKey = await this.getOrCreateKey(db);
            const stored = await this.idbGet<EncryptedEntry>(db, KEY_SENDER_NAME);
            if (!stored) {
                const existing = this.readLegacySenderName();
                if (existing) {
                    this.senderName.set(existing);
                    await this.saveToIdb(existing);
                }
                return;
            }
            const plain = await this.decrypt(stored.ciphertext, stored.iv, encKey);
            this.senderName.set(plain);
        } catch { }
        finally {

            if (this.senderName() && !this.onboarded()) {
                this.markOnboarded();
            }
            this.hydrated.set(true);
            this.hydratedResolve();
        }
    }

    /**
     * One-time migration: the sender name used to be mirrored in
     * localStorage as plaintext alongside its encrypted IndexedDB copy.
     * That mirror is gone now — this only reads it on a fresh load when no
     * encrypted entry exists yet, then removes the legacy key for good.
     */
    private readLegacySenderName(): string | null {
        try {
            const value = localStorage.getItem(LEGACY_SENDER_NAME_KEY);
            if (value !== null) localStorage.removeItem(LEGACY_SENDER_NAME_KEY);
            return value;
        } catch {
            return null;
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
