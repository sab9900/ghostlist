import { inject, Injectable } from '@angular/core';
import { KnownList } from '../models';
import { ListStorageService } from './list-storage.service';
import { VaultKeyService } from './vault-key.service';

@Injectable({ providedIn: 'root' })
export class VaultMigrationService {
    private readonly storage = inject(ListStorageService);
    private readonly vaultKey = inject(VaultKeyService);

    async wrapLists(scope: 'all' | 'sensitive'): Promise<void> {
        const lists = await this.storage.getAll();
        for (const list of lists) {
            if (list.encryptionKeyWrapped) continue;
            if (scope === 'sensitive' && !list.isSensitive) continue;
            if (!list.encryptionKey) continue;
            const wrapped = await this.vaultKey.encryptListKey(list.encryptionKey);
            await this.storage.upsert({ ...list, encryptionKeyWrapped: wrapped });
        }

        const refreshed = await this.storage.getAll();
        for (const list of refreshed) {
            if (!list.encryptionKeyWrapped) continue;
            if (!list.encryptionKey) continue;
            await this.storage.upsert({ ...list, encryptionKey: '' });
        }
    }

    async wrapSingleList(listId: string): Promise<void> {
        const lists = await this.storage.getAll();
        const list = lists.find(l => l.id === listId);
        if (!list || list.encryptionKeyWrapped || !list.encryptionKey) return;
        const wrapped = await this.vaultKey.encryptListKey(list.encryptionKey);
        await this.storage.upsert({ ...list, encryptionKeyWrapped: wrapped, encryptionKey: '' });
    }

    async unwrapAll(): Promise<KnownList[]> {
        const lists = await this.storage.getAll();
        const resolved: KnownList[] = [];
        for (const list of lists) {
            if (!list.encryptionKeyWrapped) {
                resolved.push(list);
                continue;
            }
            try {
                const plain = await this.vaultKey.decryptListKey(list.encryptionKeyWrapped);
                resolved.push({ ...list, encryptionKey: plain });
            } catch {
                resolved.push({ ...list, encryptionKey: '' });
            }
        }
        return resolved;
    }

    redactWrapped(lists: KnownList[]): KnownList[] {
        return lists.map(l => l.encryptionKeyWrapped ? { ...l, encryptionKey: '' } : l);
    }

    async hasAnyWrappedList(): Promise<boolean> {
        const lists = await this.storage.getAll();
        return lists.some(l => !!l.encryptionKeyWrapped);
    }

    private async unwrapToPlaintext(list: KnownList): Promise<void> {
        if (!list.encryptionKeyWrapped) return;
        const plain = await this.vaultKey.decryptListKey(list.encryptionKeyWrapped);
        const { encryptionKeyWrapped, ...rest } = list;
        void encryptionKeyWrapped;
        await this.storage.upsert({ ...rest, encryptionKey: plain });
    }

    async shrinkScopeToSensitive(): Promise<void> {
        const lists = await this.storage.getAll();
        for (const list of lists) {
            if (list.encryptionKeyWrapped && !list.isSensitive) {
                await this.unwrapToPlaintext(list);
            }
        }
    }

    async unwrapAllToPlaintext(): Promise<void> {
        const lists = await this.storage.getAll();
        for (const list of lists) {
            if (list.encryptionKeyWrapped) await this.unwrapToPlaintext(list);
        }
    }
}
