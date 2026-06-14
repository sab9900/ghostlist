import { inject, Injectable, signal } from '@angular/core';
import { ListStorageService } from './list-storage.service';

const PREF_KEY = 'master-password';
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

interface StoredMasterPassword {
    salt: string;
    hash: string;
    iterations: number;
}

/**
 * Manages an optional per-device "master password" used to gate access to
 * lists the user has marked as sensitive. The password itself is never
 * stored — only a salted PBKDF2 hash, kept in the `user-preferences` IDB
 * store (see `ListStorageService`).
 */
@Injectable({ providedIn: 'root' })
export class MasterPasswordService {
    private readonly storage = inject(ListStorageService);

    /** True once a master password has been set on this device. */
    readonly hasPassword = signal(false);

    /** True once the initial IDB hydration has completed. */
    readonly hydrated = signal(false);

    private hydratedResolve!: () => void;
    private readonly hydratedPromise = new Promise<void>(resolve => { this.hydratedResolve = resolve; });

    constructor() {
        void this.load();
    }

    /** Resolves once hydration from IDB has completed. */
    whenHydrated(): Promise<void> {
        return this.hydratedPromise;
    }

    private async load(): Promise<void> {
        try {
            const stored = await this.storage.getPref<StoredMasterPassword>(PREF_KEY);
            this.hasPassword.set(!!stored);
        } catch {
            this.hasPassword.set(false);
        } finally {
            this.hydrated.set(true);
            this.hydratedResolve();
        }
    }

    /** Sets (or replaces) the master password for this device. */
    async setPassword(password: string): Promise<void> {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const hash = await this.derive(password, salt);
        const entry: StoredMasterPassword = {
            salt: this.bufToB64(salt),
            hash: this.bufToB64(hash),
            iterations: PBKDF2_ITERATIONS,
        };
        await this.storage.setPref(PREF_KEY, entry);
        this.hasPassword.set(true);
    }

    /** Verifies a candidate password against the stored hash. */
    async verifyPassword(password: string): Promise<boolean> {
        const stored = await this.storage.getPref<StoredMasterPassword>(PREF_KEY);
        if (!stored) return false;
        const salt = this.b64ToBuf(stored.salt);
        const hash = await this.derive(password, salt, stored.iterations);
        return this.constantTimeEqual(hash, this.b64ToBuf(stored.hash));
    }

    /** Removes the master password from this device. */
    async removePassword(): Promise<void> {
        await this.storage.deletePref(PREF_KEY);
        this.hasPassword.set(false);
    }

    private async derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<Uint8Array> {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveBits'],
        );
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
            keyMaterial,
            HASH_BITS,
        );
        return new Uint8Array(bits);
    }

    private constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
        if (a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
        return diff === 0;
    }

    private bufToB64(buf: ArrayBuffer | Uint8Array): string {
        const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return btoa(s);
    }

    private b64ToBuf(s: string): Uint8Array<ArrayBuffer> {
        const bin = atob(s);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf;
    }
}
