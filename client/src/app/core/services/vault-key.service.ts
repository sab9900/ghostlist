import { Injectable, signal } from '@angular/core';

export interface PasswordWrappedVaultKey {
    salt: string;
    iv: string;
    ciphertext: string;
    iterations: number;
}

export interface RawWrappedVaultKey {
    iv: string;
    ciphertext: string;
}

export interface EncryptedListKey {
    iv: string;
    ciphertext: string;
}

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const RECOVERY_CODE_BYTES = 20;
const RECOVERY_GROUP_SIZE = 5;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Injectable({ providedIn: 'root' })
export class VaultKeyService {

    private vaultKey: CryptoKey | null = null;

    readonly unlocked = signal(false);

    isUnlocked(): boolean {
        return this.vaultKey !== null;
    }

    lock(): void {
        this.vaultKey = null;
        this.unlocked.set(false);
    }

    async createVaultKey(): Promise<void> {
        this.vaultKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt'],
        );
        this.unlocked.set(true);
    }

    generateRecoveryCode(): string {
        const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES));
        let out = '';
        for (const b of bytes) out += BASE32_ALPHABET[b % BASE32_ALPHABET.length];
        const groups: string[] = [];
        for (let i = 0; i < out.length; i += RECOVERY_GROUP_SIZE) groups.push(out.slice(i, i + RECOVERY_GROUP_SIZE));
        return groups.join('-');
    }

    generateRawSecret(byteLength = 32): Uint8Array<ArrayBuffer> {
        return crypto.getRandomValues(new Uint8Array(byteLength));
    }

    async wrapVaultKeyWithPassword(password: string): Promise<PasswordWrappedVaultKey> {
        const vk = this.requireVaultKey();
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const kek = await this.deriveKekFromPassword(password, salt, PBKDF2_ITERATIONS);
        const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const wrapped = await crypto.subtle.wrapKey('raw', vk, kek, { name: 'AES-GCM', iv });
        return {
            salt: this.bufToB64(salt),
            iv: this.bufToB64(iv),
            ciphertext: this.bufToB64(wrapped),
            iterations: PBKDF2_ITERATIONS,
        };
    }

    async unwrapVaultKeyWithPassword(password: string, wrapped: PasswordWrappedVaultKey): Promise<boolean> {
        try {
            const salt = this.b64ToBuf(wrapped.salt);
            const kek = await this.deriveKekFromPassword(password, salt, wrapped.iterations);
            const vk = await crypto.subtle.unwrapKey(
                'raw',
                this.b64ToBuf(wrapped.ciphertext),
                kek,
                { name: 'AES-GCM', iv: this.b64ToBuf(wrapped.iv) },
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt'],
            );
            this.vaultKey = vk;
            this.unlocked.set(true);
            return true;
        } catch {
            return false;
        }
    }

    async wrapVaultKeyWithRawSecret(secret: Uint8Array<ArrayBuffer>): Promise<RawWrappedVaultKey> {
        const vk = this.requireVaultKey();
        const kek = await this.importRawSecretAsKek(secret);
        const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const wrapped = await crypto.subtle.wrapKey('raw', vk, kek, { name: 'AES-GCM', iv });
        return { iv: this.bufToB64(iv), ciphertext: this.bufToB64(wrapped) };
    }

    async unwrapVaultKeyWithRawSecret(secret: Uint8Array<ArrayBuffer>, wrapped: RawWrappedVaultKey): Promise<boolean> {
        try {
            const kek = await this.importRawSecretAsKek(secret);
            const vk = await crypto.subtle.unwrapKey(
                'raw',
                this.b64ToBuf(wrapped.ciphertext),
                kek,
                { name: 'AES-GCM', iv: this.b64ToBuf(wrapped.iv) },
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt'],
            );
            this.vaultKey = vk;
            this.unlocked.set(true);
            return true;
        } catch {
            return false;
        }
    }

    async wrapVaultKeyWithRecoveryCode(code: string): Promise<PasswordWrappedVaultKey> {
        return this.wrapVaultKeyWithPassword(this.normalizeRecoveryCode(code));
    }

    async unwrapVaultKeyWithRecoveryCode(code: string, wrapped: PasswordWrappedVaultKey): Promise<boolean> {
        return this.unwrapVaultKeyWithPassword(this.normalizeRecoveryCode(code), wrapped);
    }

    async encryptListKey(rawKeyB64: string): Promise<EncryptedListKey> {
        const vk = this.requireVaultKey();
        const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const buf = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            vk,
            new TextEncoder().encode(rawKeyB64),
        );
        return { iv: this.bufToB64(iv), ciphertext: this.bufToB64(buf) };
    }

    async decryptListKey(encrypted: EncryptedListKey): Promise<string> {
        const vk = this.requireVaultKey();
        const buf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: this.b64ToBuf(encrypted.iv) },
            vk,
            this.b64ToBuf(encrypted.ciphertext),
        );
        return new TextDecoder().decode(buf);
    }

    private normalizeRecoveryCode(code: string): string {
        return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    private requireVaultKey(): CryptoKey {
        if (!this.vaultKey) throw new Error('Vault key is not available. Unlock the vault first.');
        return this.vaultKey;
    }

    private async deriveKekFromPassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey'],
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['wrapKey', 'unwrapKey'],
        );
    }

    private importRawSecretAsKek(secret: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
        return crypto.subtle.importKey(
            'raw',
            secret,
            { name: 'AES-GCM' },
            false,
            ['wrapKey', 'unwrapKey'],
        );
    }

    private bufToB64(buf: ArrayBuffer | Uint8Array): string {
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let binary = '';
        const CHUNK = 8192;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    private b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
        const binary = atob(b64);
        const buf = new ArrayBuffer(binary.length);
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
}
