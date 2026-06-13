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
                    patchState(store, { knownLists, listsLoaded: true });

                    if (knownLists.length === 0) return;
                    const checks = await Promise.all(
                        knownLists.map(async (l) => ({
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

                async _persistAndTrack(entry: KnownList): Promise<void> {
                    await storage.upsert(entry);
                    patchState(store, {
                        knownLists: [...store.knownLists().filter((l) => l.id !== entry.id), entry],
                    });
                },

                /** Rolls back a list that was tracked locally but could never be joined (e.g. it's full). */
                async _unregisterKnownList(listId: string): Promise<void> {
                    await storage.remove(listId).catch(() => { });
                    patchState(store, { knownLists: store.knownLists().filter((l) => l.id !== listId) });
                },

                /** Updates this device's per-list push notification preferences (opt-out toggles, default ON). */
                async updateNotificationPreferences(listId: string, notifyOnMessage: boolean, notifyOnItemsChanged: boolean): Promise<void> {
                    const known = store.knownLists().find(l => l.id === listId);
                    if (!known) return;
                    const updated: KnownList = { ...known, notifyOnMessage, notifyOnItemsChanged };
                    await storage.upsert(updated);
                    patchState(store, {
                        knownLists: store.knownLists().map(l => l.id === listId ? updated : l),
                    });
                    await push.updatePreferences(listId, notifyOnMessage, notifyOnItemsChanged);
                },

                async _registerAsMember(listId: string, encryptionKey: string): Promise<void> {
                    if (registeredThisSession.has(listId)) return;
                    registeredThisSession.add(listId);
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
                        // Allow a retry later (e.g. once back online, or after the list has room again).
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
