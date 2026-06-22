import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CachedList, KnownList, PendingOperation } from '../models';
import { ListStorageService } from './list-storage.service';

function makeList(overrides: Partial<KnownList> = {}): KnownList {
    return {
        id: 'list-1',
        name: 'My List',
        encryptionKey: 'key-abc',
        addedAt: '2024-01-01T00:00:00Z',
        ...overrides,
    };
}

function makeCache(listId: string): CachedList {
    return {
        id: listId,
        ttl: 3600,
        whisperLifetimeSeconds: 60,
        createdAt: '2024-01-01T00:00:00Z',
        items: [],
        messages: [],
        hasMoreMessages: false,
        cachedAt: new Date().toISOString(),
    };
}

describe('ListStorageService', () => {
    let svc: ListStorageService;

    beforeEach(() => {
        svc = new ListStorageService();
    });

    afterEach(async () => {
        await svc.deleteDatabase();
    });

    describe('known lists', () => {
        it('returns an empty array when no lists have been stored', async () => {
            const result = await svc.getAll();
            expect(result).toEqual([]);
        });

        it('stores and retrieves a list', async () => {
            const list = makeList();
            await svc.upsert(list);

            const result = await svc.getAll();

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(list);
        });

        it('updates an existing list on upsert', async () => {
            await svc.upsert(makeList({ name: 'Original' }));
            await svc.upsert(makeList({ name: 'Updated' }));

            const result = await svc.getAll();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Updated');
        });

        it('stores multiple lists independently', async () => {
            await svc.upsert(makeList({ id: 'a', name: 'A' }));
            await svc.upsert(makeList({ id: 'b', name: 'B' }));

            const result = await svc.getAll();

            expect(result).toHaveLength(2);
        });

        it('removes a list by id', async () => {
            await svc.upsert(makeList({ id: 'keep' }));
            await svc.upsert(makeList({ id: 'gone' }));

            await svc.remove('gone');

            const result = await svc.getAll();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('keep');
        });

        it('is a no-op when removing a non-existent id', async () => {
            await svc.upsert(makeList());
            await svc.remove('nonexistent');

            const result = await svc.getAll();
            expect(result).toHaveLength(1);
        });
    });

    describe('list cache', () => {
        it('returns undefined for a cache miss', async () => {
            const result = await svc.getListCache('missing');
            expect(result).toBeUndefined();
        });

        it('stores and retrieves a cached list', async () => {
            const cache = makeCache('list-1');
            await svc.putListCache(cache);

            const result = await svc.getListCache('list-1');

            expect(result).toEqual(cache);
        });

        it('overwrites an existing cache entry', async () => {
            await svc.putListCache(makeCache('list-1'));
            const updated = { ...makeCache('list-1'), ttl: 9999 };
            await svc.putListCache(updated);

            const result = await svc.getListCache('list-1');
            expect(result?.ttl).toBe(9999);
        });

        it('removes the cache entry', async () => {
            await svc.putListCache(makeCache('list-1'));
            await svc.removeListCache('list-1');

            const result = await svc.getListCache('list-1');
            expect(result).toBeUndefined();
        });

        it('also removes the list cache when removing a known list', async () => {
            await svc.upsert(makeList({ id: 'list-1' }));
            await svc.putListCache(makeCache('list-1'));

            await svc.remove('list-1');

            const cache = await svc.getListCache('list-1');
            expect(cache).toBeUndefined();
        });
    });

    describe('pending operations', () => {
        const op: PendingOperation = {
            type: 'createItem',
            listId: 'list-1',
            tempItemId: 'temp-1',
            payload: { listId: 'list-1', content: 'Buy milk', createdAt: '2024-01-01T00:00:00Z' },
            createdAt: '2024-01-01T00:00:00Z',
        };

        it('returns an empty array when no ops have been queued', async () => {
            const result = await svc.getPendingOps();
            expect(result).toEqual([]);
        });

        it('adds and retrieves a pending operation', async () => {
            const localId = await svc.addPendingOp(op);

            const result = await svc.getPendingOps();
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('createItem');
            expect(result[0].localId).toBe(localId);
        });

        it('removes a pending operation by localId', async () => {
            const localId = await svc.addPendingOp(op);
            await svc.removePendingOp(localId);

            const result = await svc.getPendingOps();
            expect(result).toHaveLength(0);
        });

        it('assigns auto-incrementing localIds', async () => {
            const id1 = await svc.addPendingOp(op);
            const id2 = await svc.addPendingOp({ ...op, tempItemId: 'temp-2' });

            expect(id2).toBeGreaterThan(id1);
        });

        it('removing one op leaves the others intact', async () => {
            const id1 = await svc.addPendingOp({ ...op, tempItemId: 'a' });
            await svc.addPendingOp({ ...op, tempItemId: 'b' });
            await svc.removePendingOp(id1);

            const result = await svc.getPendingOps();
            expect(result).toHaveLength(1);
            expect((result[0] as { tempItemId: string }).tempItemId).toBe('b');
        });
    });

    describe('preferences', () => {
        it('returns undefined for a missing key', async () => {
            const result = await svc.getPref('missing');
            expect(result).toBeUndefined();
        });

        it('stores and retrieves a string preference', async () => {
            await svc.setPref('theme', 'dark');
            const result = await svc.getPref<string>('theme');
            expect(result).toBe('dark');
        });

        it('stores and retrieves an object preference', async () => {
            const obj = { salt: 'abc', iv: 'def', ciphertext: 'xyz', iterations: 210000 };
            await svc.setPref('vault', obj);
            const result = await svc.getPref<typeof obj>('vault');
            expect(result).toEqual(obj);
        });

        it('overwrites an existing preference', async () => {
            await svc.setPref('name', 'Alice');
            await svc.setPref('name', 'Bob');
            const result = await svc.getPref<string>('name');
            expect(result).toBe('Bob');
        });

        it('deletes a preference', async () => {
            await svc.setPref('to-delete', 'value');
            await svc.deletePref('to-delete');
            const result = await svc.getPref('to-delete');
            expect(result).toBeUndefined();
        });

        it('returns all prefs as raw key-value pairs', async () => {
            await svc.setPref('a', 1);
            await svc.setPref('b', 2);
            const raw = await svc.getAllPrefsRaw();
            expect(raw).toHaveLength(2);
            expect(raw.map(r => r.key).sort()).toEqual(['a', 'b']);
        });
    });

    describe('deleteDatabase', () => {
        it('clears all stored data', async () => {
            await svc.upsert(makeList());
            await svc.setPref('x', 'y');
            await svc.deleteDatabase();

            const fresh = new ListStorageService();
            const lists = await fresh.getAll();
            const pref = await fresh.getPref('x');

            expect(lists).toHaveLength(0);
            expect(pref).toBeUndefined();

            await fresh.deleteDatabase();
        });
    });
});
