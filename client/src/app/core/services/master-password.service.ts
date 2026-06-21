import { inject, Injectable, signal } from '@angular/core';
import { ListStorageService } from './list-storage.service';
import { PasswordWrappedVaultKey, VaultKeyService } from './vault-key.service';

const PREF_KEY = 'master-password';
const RECOVERY_PREF_KEY = 'vault-recovery';
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

interface LegacyMasterPasswordRecord {
    salt: string;
    hash: string;
    iterations: number;
}

interface StoredMasterPasswordRecord extends Partial<LegacyMasterPasswordRecord> {
    vault?: PasswordWrappedVaultKey;
}

export interface SetPasswordResult {
    recoveryCode: string | null;
}

@Injectable({ providedIn: 'root' })
export class MasterPasswordService {
    private readonly storage = inject(ListStorageService);
    private readonly vaultKey = inject(VaultKeyService);

    readonly hasPassword = signal(false);

    readonly hasRecovery = signal(false);

    readonly hydrated = signal(false);

    readonly pendingRecoveryCode = signal<string | null>(null);

    private hydratedResolve!: () => void;
    private readonly hydratedPromise = new Promise<void>(resolve => { this.hydratedResolve = resolve; });

    constructor() {
        void this.load();
    }

    whenHydrated(): Promise<void> {
        return this.hydratedPromise;
    }

    acknowledgeRecoveryCode(): void {
        this.pendingRecoveryCode.set(null);
    }

    async hasVault(): Promise<boolean> {
        const stored = await this.storage.getPref<StoredMasterPasswordRecord>(PREF_KEY);
        return !!stored?.vault;
    }

    private async load(): Promise<void> {
        try {
            const stored = await this.storage.getPref<StoredMasterPasswordRecord>(PREF_KEY);
            this.hasPassword.set(!!stored);
            const recovery = await this.storage.getPref<PasswordWrappedVaultKey>(RECOVERY_PREF_KEY);
            this.hasRecovery.set(!!recovery);
        } catch {
            this.hasPassword.set(false);
            this.hasRecovery.set(false);
        } finally {
            this.hydrated.set(true);
            this.hydratedResolve();
        }
    }

    async setPassword(password: string): Promise<SetPasswordResult> {
        const stored = await this.storage.getPref<StoredMasterPasswordRecord>(PREF_KEY);
        const isFirstSetup = !stored?.vault;

        if (isFirstSetup) {
            await this.vaultKey.createVaultKey();
        } else if (!this.vaultKey.isUnlocked()) {
            throw new Error('Vault must be unlocked with the current password before it can be changed.');
        }

        const vaultWrap = await this.vaultKey.wrapVaultKeyWithPassword(password);
        await this.storage.setPref<StoredMasterPasswordRecord>(PREF_KEY, { vault: vaultWrap });
        this.hasPassword.set(true);

        let recoveryCode: string | null = null;
        if (isFirstSetup) {
            recoveryCode = this.vaultKey.generateRecoveryCode();
            const recoveryWrap = await this.vaultKey.wrapVaultKeyWithRecoveryCode(recoveryCode);
            await this.storage.setPref<PasswordWrappedVaultKey>(RECOVERY_PREF_KEY, recoveryWrap);
            this.pendingRecoveryCode.set(recoveryCode);
            this.hasRecovery.set(true);
        }

        return { recoveryCode };
    }

    async verifyPassword(password: string): Promise<boolean> {
        const stored = await this.storage.getPref<StoredMasterPasswordRecord>(PREF_KEY);
        if (!stored) return false;

        if (stored.vault) {
            return this.vaultKey.unwrapVaultKeyWithPassword(password, stored.vault);
        }

        if (!stored.salt || !stored.hash || !stored.iterations) return false;
        const ok = await this.legacyHashCheck(password, stored as LegacyMasterPasswordRecord);
        if (!ok) return false;

        await this.migrateLegacyRecord(password, stored as LegacyMasterPasswordRecord);
        return true;
    }

    async unlockWithRecoveryCode(code: string): Promise<boolean> {
        const wrapped = await this.storage.getPref<PasswordWrappedVaultKey>(RECOVERY_PREF_KEY);
        if (!wrapped) return false;
        return this.vaultKey.unwrapVaultKeyWithRecoveryCode(code, wrapped);
    }

    async hasRecoveryCode(): Promise<boolean> {
        const wrapped = await this.storage.getPref<PasswordWrappedVaultKey>(RECOVERY_PREF_KEY);
        return !!wrapped;
    }

    async removePassword(): Promise<void> {
        await this.storage.deletePref(PREF_KEY);
        await this.storage.deletePref(RECOVERY_PREF_KEY);
        this.hasPassword.set(false);
        this.hasRecovery.set(false);
        this.vaultKey.lock();
    }

    private async migrateLegacyRecord(password: string, legacy: LegacyMasterPasswordRecord): Promise<void> {
        await this.vaultKey.createVaultKey();
        const vaultWrap = await this.vaultKey.wrapVaultKeyWithPassword(password);
        await this.storage.setPref<StoredMasterPasswordRecord>(PREF_KEY, { ...legacy, vault: vaultWrap });

        const recoveryCode = this.vaultKey.generateRecoveryCode();
        const recoveryWrap = await this.vaultKey.wrapVaultKeyWithRecoveryCode(recoveryCode);
        await this.storage.setPref<PasswordWrappedVaultKey>(RECOVERY_PREF_KEY, recoveryWrap);

        this.pendingRecoveryCode.set(recoveryCode);
        this.hasRecovery.set(true);
    }

    private async legacyHashCheck(password: string, stored: LegacyMasterPasswordRecord): Promise<boolean> {
        const salt = this.b64ToBuf(stored.salt);
        const hash = await this.derive(password, salt, stored.iterations);
        return this.constantTimeEqual(hash, this.b64ToBuf(stored.hash));
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

    private b64ToBuf(s: string): Uint8Array<ArrayBuffer> {
        const bin = atob(s);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf;
    }
}
