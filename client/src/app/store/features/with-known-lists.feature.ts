import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStoreFeature, type, withMethods } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api/api.service';
import { KnownList, ListFullError } from '../../core/models';
import { CryptoService } from '../../core/services/crypto.service';
import { DeviceIdService } from '../../core/services/device-id.service';
import { UserIdService } from '../../core/services/user-id.service';
import { ListStorageService } from '../../core/services/list-storage.service';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { VaultKeyService } from '../../core/services/vault-key.service';
import { VaultMigrationService } from '../../core/services/vault-migration.service';

function stripPlaintextIfWrapped(list: KnownList): KnownList {
    return list.encryptionKeyWrapped ? { ...list, encryptionKey: '' } : list;
}

export function withKnownLists() {
    return signalStoreFeature(
        type<{
            state: {
                knownLists: KnownList[];
                listsLoaded: boolean;
            };
        }>(),

        withMethods((store) => {
            const api = inject(ApiService);
            const storage = inject(ListStorageService);
            const crypto = inject(CryptoService);
            const deviceId = inject(DeviceIdService);
            const userId = inject(UserIdService);
            const prefs = inject(UserPreferencesService);
            const push = inject(PushNotificationService);
            const vaultKey = inject(VaultKeyService);
            const vaultMigration = inject(VaultMigrationService);

            const registeredThisSession = new Set<string>();

            return {
                async loadKnownLists(): Promise<void> {
                    let knownLists: KnownList[];
                    try {
                        knownLists = await storage.getAll();
                    } catch {
                        patchState(store, { listsLoaded: true });
                        return;
                    }

                    const hasWrapped = knownLists.some(l => l.encryptionKeyWrapped);
                    const resolved = !hasWrapped
                        ? knownLists
                        : vaultKey.isUnlocked()
                            ? await vaultMigration.unwrapAll()
                            : vaultMigration.redactWrapped(knownLists);

                    patchState(store, { knownLists: resolved, listsLoaded: true });

                    if (resolved.length === 0) return;
                    const checks = await Promise.all(
                        resolved.map(async (l) => ({
                            id: l.id,
                            alive: await firstValueFrom(api.checkList(l.id))
                                .then(() => true)
                                .catch((err: unknown) =>
                                    !(err instanceof HttpErrorResponse && err.status === 404),
                                ),
                        })),
                    );
                    const deadIds = checks.filter(c => !c.alive).map(c => c.id);
                    if (deadIds.length === 0) return;
                    await Promise.all(deadIds.map(id => storage.remove(id)));
                    patchState(store, { knownLists: store.knownLists().filter(l => !deadIds.includes(l.id)) });
                },

                async unlockKnownLists(): Promise<void> {
                    const resolved = await vaultMigration.unwrapAll();
                    patchState(store, { knownLists: resolved });
                },

                lockKnownLists(): void {
                    patchState(store, {
                        knownLists: store.knownLists().map(l => l.encryptionKeyWrapped ? { ...l, encryptionKey: '' } : l),
                    });
                },

                async _persistAndTrack(entry: KnownList): Promise<void> {
                    await storage.upsert(stripPlaintextIfWrapped(entry));
                    patchState(store, {
                        knownLists: [...store.knownLists().filter((l) => l.id !== entry.id), entry],
                    });
                },

                async _unregisterKnownList(listId: string): Promise<void> {
                    await storage.remove(listId).catch(() => { });
                    patchState(store, { knownLists: store.knownLists().filter((l) => l.id !== listId) });
                },

                async updateNotificationPreferences(
                    listId: string,
                    notifyOnMessage: boolean,
                    notifyOnItemsChanged: boolean,
                    notifyOnLethe: boolean,
                    notifyOnCharon: boolean,
                ): Promise<void> {
                    const known = store.knownLists().find(l => l.id === listId);
                    if (!known) return;
                    const updated: KnownList = { ...known, notifyOnMessage, notifyOnItemsChanged, notifyOnLethe, notifyOnCharon };
                    await storage.upsert(stripPlaintextIfWrapped(updated));
                    patchState(store, {
                        knownLists: store.knownLists().map(l => l.id === listId ? updated : l),
                    });
                    await push.updatePreferences(listId, notifyOnMessage, notifyOnItemsChanged, notifyOnLethe, notifyOnCharon);
                },

                async setListSensitive(listId: string, isSensitive: boolean): Promise<void> {
                    const known = store.knownLists().find(l => l.id === listId);
                    if (!known) return;

                    if (isSensitive && !known.encryptionKeyWrapped && vaultKey.isUnlocked()) {
                        await vaultMigration.wrapSingleList(listId);
                    }

                    const persisted = await storage.getAll();
                    const fresh = persisted.find(l => l.id === listId) ?? known;
                    const updated: KnownList = { ...fresh, isSensitive, encryptionKey: known.encryptionKey };
                    await storage.upsert(stripPlaintextIfWrapped(updated));
                    patchState(store, {
                        knownLists: store.knownLists().map(l => l.id === listId ? updated : l),
                    });
                },

                async _registerAsMember(listId: string, encryptionKey: string): Promise<void> {
                    if (registeredThisSession.has(listId)) return;
                    registeredThisSession.add(listId);

                    await prefs.whenHydrated();
                    await prefs.whenOnboarded();

                    try {
                        const payload = JSON.stringify({
                            deviceId: deviceId.deviceId,
                            userId: userId.userId(),
                            displayName: prefs.senderName() || 'Anonymous',
                            joinedAt: new Date().toISOString(),
                        });
                        const { ciphertext, iv } = await crypto.encrypt(payload, encryptionKey);
                        await firstValueFrom(api.upsertMember(listId, deviceId.deviceId, ciphertext, iv));
                    } catch (e: unknown) {

                        registeredThisSession.delete(listId);
                        if (e instanceof HttpErrorResponse && e.status === 409) {
                            throw new ListFullError();
                        }
                    }
                },
            };
        }),
    );
}
