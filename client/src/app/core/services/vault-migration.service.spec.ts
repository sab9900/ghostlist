import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KnownList } from '../models';
import { ListStorageService } from './list-storage.service';
import { VaultKeyService } from './vault-key.service';
import { VaultMigrationService } from './vault-migration.service';

function makeList(overrides: Partial<KnownList> = {}): KnownList {
    return {
        id: 'list-1',
        name: 'Test',
        encryptionKey: 'raw-key-b64==',
        addedAt: '2024-01-01T00:00:00Z',
        ...overrides,
    };
}

function makeStorageMock(initial: KnownList[] = []) {
    let lists: KnownList[] = [...initial];
    return {
        getAll: vi.fn(async () => [...lists]),
        upsert: vi.fn(async (list: KnownList) => {
            const idx = lists.findIndex(l => l.id === list.id);
            if (idx >= 0) lists[idx] = list;
            else lists.push(list);
        }),
        _lists: () => lists,
    };
}

async function setup(initial: KnownList[] = []) {
    const storage = makeStorageMock(initial);

    TestBed.configureTestingModule({
        providers: [
            provideZonelessChangeDetection(),
            VaultMigrationService,
            VaultKeyService,
            { provide: ListStorageService, useValue: storage },
        ],
    });

    const vaultKey = TestBed.inject(VaultKeyService);
    await vaultKey.createVaultKey();

    const svc = TestBed.inject(VaultMigrationService);
    return { svc, storage, vaultKey };
}

describe('VaultMigrationService', () => {
    afterEach(() => TestBed.resetTestingModule());

    describe('wrapLists', () => {
        it('wraps a list that has a plaintext key and clears it', async () => {
            const { svc, storage } = await setup([makeList({ encryptionKey: 'raw-key==' })]);

            await svc.wrapLists('all');

            const lists = storage._lists();
            expect(lists[0].encryptionKeyWrapped).toBeDefined();
            expect(lists[0].encryptionKey).toBe('');
        });

        it('skips lists that are already wrapped', async () => {
            const { svc, storage, vaultKey } = await setup([makeList()]);
            await svc.wrapLists('all');
            const callsBefore = storage.upsert.mock.calls.length;

            await svc.wrapLists('all');

            expect(storage.upsert.mock.calls.length).toBe(callsBefore);
        });

        it('skips lists with no plaintext key', async () => {
            const { svc, storage } = await setup([makeList({ encryptionKey: '' })]);

            await svc.wrapLists('all');

            expect(storage.upsert).not.toHaveBeenCalled();
        });

        it('wraps all lists when scope is all', async () => {
            const { svc, storage } = await setup([
                makeList({ id: 'a', isSensitive: false, encryptionKey: 'key-a' }),
                makeList({ id: 'b', isSensitive: true, encryptionKey: 'key-b' }),
            ]);

            await svc.wrapLists('all');

            const lists = storage._lists();
            expect(lists.every(l => !!l.encryptionKeyWrapped)).toBe(true);
        });

        it('only wraps sensitive lists when scope is sensitive', async () => {
            const { svc, storage } = await setup([
                makeList({ id: 'normal', isSensitive: false, encryptionKey: 'key-n' }),
                makeList({ id: 'secret', isSensitive: true, encryptionKey: 'key-s' }),
            ]);

            await svc.wrapLists('sensitive');

            const lists = storage._lists();
            const normal = lists.find(l => l.id === 'normal')!;
            const secret = lists.find(l => l.id === 'secret')!;
            expect(normal.encryptionKeyWrapped).toBeUndefined();
            expect(secret.encryptionKeyWrapped).toBeDefined();
        });
    });

    describe('wrapSingleList', () => {
        it('wraps the named list and clears the plaintext key', async () => {
            const { svc, storage } = await setup([
                makeList({ id: 'target', encryptionKey: 'raw' }),
                makeList({ id: 'other', encryptionKey: 'other-raw' }),
            ]);

            await svc.wrapSingleList('target');

            const lists = storage._lists();
            const target = lists.find(l => l.id === 'target')!;
            const other = lists.find(l => l.id === 'other')!;
            expect(target.encryptionKeyWrapped).toBeDefined();
            expect(target.encryptionKey).toBe('');
            expect(other.encryptionKeyWrapped).toBeUndefined();
        });

        it('is a no-op for a list that is already wrapped', async () => {
            const { svc, storage } = await setup([makeList()]);
            await svc.wrapLists('all');
            const callsBefore = storage.upsert.mock.calls.length;

            await svc.wrapSingleList('list-1');

            expect(storage.upsert.mock.calls.length).toBe(callsBefore);
        });
    });

    describe('unwrapAll', () => {
        it('returns plaintext key for a wrapped list', async () => {
            const originalKey = 'raw-key-b64==';
            const { svc } = await setup([makeList({ encryptionKey: originalKey })]);
            await svc.wrapLists('all');

            const resolved = await svc.unwrapAll();

            expect(resolved[0].encryptionKey).toBe(originalKey);
        });

        it('returns the list as-is when it has no wrapped key', async () => {
            const { svc } = await setup([makeList({ encryptionKey: 'plain', encryptionKeyWrapped: undefined })]);

            const resolved = await svc.unwrapAll();

            expect(resolved[0].encryptionKey).toBe('plain');
        });
    });

    describe('redactWrapped', () => {
        it('clears the plaintext key on a list that has a wrapped key', async () => {
            const { svc } = await setup();
            const list = makeList({ encryptionKey: 'visible', encryptionKeyWrapped: { iv: 'x', ciphertext: 'y' } });

            const result = svc.redactWrapped([list]);

            expect(result[0].encryptionKey).toBe('');
        });

        it('leaves the key on a list with no wrapped key', async () => {
            const { svc } = await setup();
            const list = makeList({ encryptionKey: 'visible' });

            const result = svc.redactWrapped([list]);

            expect(result[0].encryptionKey).toBe('visible');
        });
    });

    describe('hasAnyWrappedList', () => {
        it('returns false when no lists are wrapped', async () => {
            const { svc } = await setup([makeList()]);
            expect(await svc.hasAnyWrappedList()).toBe(false);
        });

        it('returns true after wrapping a list', async () => {
            const { svc } = await setup([makeList()]);
            await svc.wrapLists('all');
            expect(await svc.hasAnyWrappedList()).toBe(true);
        });
    });

    describe('shrinkScopeToSensitive', () => {
        it('unwraps non-sensitive lists back to plaintext', async () => {
            const originalKey = 'key-for-normal';
            const { svc, storage } = await setup([
                makeList({ id: 'normal', isSensitive: false, encryptionKey: originalKey }),
                makeList({ id: 'secret', isSensitive: true, encryptionKey: 'key-for-secret' }),
            ]);
            await svc.wrapLists('all');

            await svc.shrinkScopeToSensitive();

            const lists = storage._lists();
            const normal = lists.find(l => l.id === 'normal')!;
            expect(normal.encryptionKey).toBe(originalKey);
            expect(normal.encryptionKeyWrapped).toBeUndefined();
        });

        it('leaves sensitive lists wrapped', async () => {
            const { svc, storage } = await setup([
                makeList({ id: 'normal', isSensitive: false, encryptionKey: 'kn' }),
                makeList({ id: 'secret', isSensitive: true, encryptionKey: 'ks' }),
            ]);
            await svc.wrapLists('all');

            await svc.shrinkScopeToSensitive();

            const secret = storage._lists().find(l => l.id === 'secret')!;
            expect(secret.encryptionKeyWrapped).toBeDefined();
        });
    });

    describe('unwrapAllToPlaintext', () => {
        it('restores plaintext keys for all wrapped lists', async () => {
            const key1 = 'key-a==';
            const key2 = 'key-b==';
            const { svc, storage } = await setup([
                makeList({ id: 'a', encryptionKey: key1 }),
                makeList({ id: 'b', encryptionKey: key2 }),
            ]);
            await svc.wrapLists('all');

            await svc.unwrapAllToPlaintext();

            const lists = storage._lists();
            expect(lists.find(l => l.id === 'a')!.encryptionKey).toBe(key1);
            expect(lists.find(l => l.id === 'b')!.encryptionKey).toBe(key2);
            expect(lists.every(l => !l.encryptionKeyWrapped)).toBe(true);
        });
    });
});
