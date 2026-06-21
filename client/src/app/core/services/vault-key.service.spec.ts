import { beforeEach, describe, expect, it } from 'vitest';
import { VaultKeyService } from './vault-key.service';

describe('VaultKeyService', () => {
    let service: VaultKeyService;

    beforeEach(() => {
        service = new VaultKeyService();
    });

    it('is locked until a vault key is created', () => {
        expect(service.isUnlocked()).toBe(false);
    });

    it('unlocks after creating a vault key', async () => {
        await service.createVaultKey();
        expect(service.isUnlocked()).toBe(true);
    });

    it('wraps and unwraps the vault key with a password', async () => {
        await service.createVaultKey();
        const wrapped = await service.wrapVaultKeyWithPassword('correct horse battery staple');

        const fresh = new VaultKeyService();
        const ok = await fresh.unwrapVaultKeyWithPassword('correct horse battery staple', wrapped);

        expect(ok).toBe(true);
        expect(fresh.isUnlocked()).toBe(true);
    });

    it('rejects the wrong password and stays locked', async () => {
        await service.createVaultKey();
        const wrapped = await service.wrapVaultKeyWithPassword('correct horse battery staple');

        const fresh = new VaultKeyService();
        const ok = await fresh.unwrapVaultKeyWithPassword('wrong password', wrapped);

        expect(ok).toBe(false);
        expect(fresh.isUnlocked()).toBe(false);
    });

    it('round-trips the vault key through a raw secret (biometric guard secret simulation)', async () => {
        await service.createVaultKey();
        const secret = service.generateRawSecret();
        const wrapped = await service.wrapVaultKeyWithRawSecret(secret);

        const fresh = new VaultKeyService();
        const ok = await fresh.unwrapVaultKeyWithRawSecret(secret, wrapped);

        expect(ok).toBe(true);
        expect(fresh.isUnlocked()).toBe(true);
    });

    it('rejects an unrelated raw secret', async () => {
        await service.createVaultKey();
        const secret = service.generateRawSecret();
        const wrapped = await service.wrapVaultKeyWithRawSecret(secret);

        const fresh = new VaultKeyService();
        const otherSecret = service.generateRawSecret();
        const ok = await fresh.unwrapVaultKeyWithRawSecret(otherSecret, wrapped);

        expect(ok).toBe(false);
    });

    it('round-trips the vault key through a recovery code, tolerating case and dashes', async () => {
        await service.createVaultKey();
        const code = service.generateRecoveryCode();
        const wrapped = await service.wrapVaultKeyWithRecoveryCode(code);

        const fresh = new VaultKeyService();
        const messyCode = code.toLowerCase().replace(/-/g, ' ');
        const ok = await fresh.unwrapVaultKeyWithRecoveryCode(messyCode, wrapped);

        expect(ok).toBe(true);
        expect(fresh.isUnlocked()).toBe(true);
    });

    it('generates recovery codes in grouped, uppercase base32 form', () => {
        const code = service.generateRecoveryCode();
        expect(code).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{5}){3}$/);
    });

    it('encrypts and decrypts a list key once unlocked', async () => {
        await service.createVaultKey();
        const rawKey = 'super-secret-list-key-base64==';
        const encrypted = await service.encryptListKey(rawKey);

        expect(encrypted.ciphertext).not.toContain(rawKey);

        const decrypted = await service.decryptListKey(encrypted);
        expect(decrypted).toBe(rawKey);
    });

    it('throws when trying to use the vault key while locked', async () => {
        await expect(service.encryptListKey('anything')).rejects.toThrow();
    });

    it('purges the vault key from memory on lock', async () => {
        await service.createVaultKey();
        service.lock();
        expect(service.isUnlocked()).toBe(false);
        await expect(service.decryptListKey({ iv: 'AA==', ciphertext: 'AA==' })).rejects.toThrow();
    });
});
