import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListStorageService } from './list-storage.service';
import { MasterPasswordService } from './master-password.service';
import { VaultKeyService } from './vault-key.service';

function makeStorageMock() {
    const prefs = new Map<string, unknown>();
    return {
        prefs,
        getPref: vi.fn(async (key: string) => prefs.get(key)),
        setPref: vi.fn(async (key: string, value: unknown) => { prefs.set(key, value); }),
        deletePref: vi.fn(async (key: string) => { prefs.delete(key); }),
    };
}

async function setup(storageMock = makeStorageMock()) {
    TestBed.configureTestingModule({
        providers: [
            provideZonelessChangeDetection(),
            MasterPasswordService,
            VaultKeyService,
            { provide: ListStorageService, useValue: storageMock },
        ],
    });

    const svc = TestBed.inject(MasterPasswordService);
    await svc.whenHydrated();
    return { svc, storage: storageMock, vaultKey: TestBed.inject(VaultKeyService) };
}

describe('MasterPasswordService', () => {
    afterEach(() => TestBed.resetTestingModule());

    describe('initial state', () => {
        it('has no password when storage is empty', async () => {
            const { svc } = await setup();
            expect(svc.hasPassword()).toBe(false);
        });

        it('has no recovery code when storage is empty', async () => {
            const { svc } = await setup();
            expect(svc.hasRecovery()).toBe(false);
        });

        it('is hydrated after construction', async () => {
            const { svc } = await setup();
            expect(svc.hydrated()).toBe(true);
        });
    });

    describe('setPassword — first setup', () => {
        it('sets hasPassword to true', async () => {
            const { svc } = await setup();
            await svc.setPassword('hunter2');
            expect(svc.hasPassword()).toBe(true);
        });

        it('returns a non-null recovery code', async () => {
            const { svc } = await setup();
            const { recoveryCode } = await svc.setPassword('hunter2');
            expect(recoveryCode).not.toBeNull();
            expect(typeof recoveryCode).toBe('string');
        });

        it('sets the pending recovery code signal', async () => {
            const { svc } = await setup();
            await svc.setPassword('hunter2');
            expect(svc.pendingRecoveryCode()).not.toBeNull();
        });

        it('acknowledgeRecoveryCode clears the pending code', async () => {
            const { svc } = await setup();
            await svc.setPassword('hunter2');
            svc.acknowledgeRecoveryCode();
            expect(svc.pendingRecoveryCode()).toBeNull();
        });

        it('sets hasRecovery to true', async () => {
            const { svc } = await setup();
            await svc.setPassword('hunter2');
            expect(svc.hasRecovery()).toBe(true);
        });

        it('unlocks the vault key', async () => {
            const { svc, vaultKey } = await setup();
            await svc.setPassword('hunter2');
            expect(vaultKey.isUnlocked()).toBe(true);
        });
    });

    describe('setPassword — change password', () => {
        it('does not generate a new recovery code', async () => {
            const { svc } = await setup();
            await svc.setPassword('original');
            const { recoveryCode } = await svc.setPassword('changed');
            expect(recoveryCode).toBeNull();
        });

        it('throws when vault is locked before changing password', async () => {
            const { svc, vaultKey } = await setup();
            await svc.setPassword('original');
            vaultKey.lock();

            await expect(svc.setPassword('changed')).rejects.toThrow();
        });
    });

    describe('verifyPassword', () => {
        it('returns true and unlocks vault with the correct password', async () => {
            const { svc, vaultKey } = await setup();
            await svc.setPassword('correct');
            vaultKey.lock();

            const ok = await svc.verifyPassword('correct');

            expect(ok).toBe(true);
            expect(vaultKey.isUnlocked()).toBe(true);
        });

        it('returns false with the wrong password', async () => {
            const { svc, vaultKey } = await setup();
            await svc.setPassword('correct');
            vaultKey.lock();

            const ok = await svc.verifyPassword('wrong');

            expect(ok).toBe(false);
            expect(vaultKey.isUnlocked()).toBe(false);
        });

        it('returns false when no password has been set', async () => {
            const { svc } = await setup();
            const ok = await svc.verifyPassword('anything');
            expect(ok).toBe(false);
        });
    });

    describe('unlockWithRecoveryCode', () => {
        it('unlocks the vault with the correct recovery code', async () => {
            const { svc, vaultKey } = await setup();
            const { recoveryCode } = await svc.setPassword('pw');
            vaultKey.lock();

            const ok = await svc.unlockWithRecoveryCode(recoveryCode!);

            expect(ok).toBe(true);
            expect(vaultKey.isUnlocked()).toBe(true);
        });

        it('returns false with an incorrect code', async () => {
            const { svc, vaultKey } = await setup();
            await svc.setPassword('pw');
            vaultKey.lock();

            const ok = await svc.unlockWithRecoveryCode('AAAAA-AAAAA-AAAAA-AAAAA');

            expect(ok).toBe(false);
        });

        it('returns false when no recovery code has been stored', async () => {
            const { svc } = await setup();
            const ok = await svc.unlockWithRecoveryCode('AAAAA-AAAAA-AAAAA-AAAAA');
            expect(ok).toBe(false);
        });
    });

    describe('removePassword', () => {
        it('sets hasPassword to false', async () => {
            const { svc } = await setup();
            await svc.setPassword('pw');
            await svc.removePassword();
            expect(svc.hasPassword()).toBe(false);
        });

        it('sets hasRecovery to false', async () => {
            const { svc } = await setup();
            await svc.setPassword('pw');
            await svc.removePassword();
            expect(svc.hasRecovery()).toBe(false);
        });

        it('locks the vault key', async () => {
            const { svc, vaultKey } = await setup();
            await svc.setPassword('pw');
            await svc.removePassword();
            expect(vaultKey.isUnlocked()).toBe(false);
        });

        it('deletes the password pref from storage', async () => {
            const { svc, storage } = await setup();
            await svc.setPassword('pw');
            await svc.removePassword();
            expect(storage.prefs.has('master-password')).toBe(false);
        });
    });

    describe('hasVault', () => {
        it('returns false before any password is set', async () => {
            const { svc } = await setup();
            expect(await svc.hasVault()).toBe(false);
        });

        it('returns true after password is set', async () => {
            const { svc } = await setup();
            await svc.setPassword('pw');
            expect(await svc.hasVault()).toBe(true);
        });
    });
});
