import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ApiService } from '../../api/api.service';
import { GhostListItem, KnownList } from '../../core/models';
import { CryptoService } from '../../core/services/crypto.service';
import { HapticsService } from '../../core/services/haptics.service';
import { SensitiveListsService } from '../../core/services/sensitive-lists.service';
import { SnackService } from '../../core/services/snack.service';
import { formatReminderDate } from '../../core/utils/reminder-date.util';

export interface ReminderSnackStoreSlice {
    currentListId: () => string | null;
    currentEncryptionKey: () => string | null;
    items: () => GhostListItem[];
    knownLists: () => KnownList[];
}

export function createReminderSnackMethods(store: ReminderSnackStoreSlice) {
    const api = inject(ApiService);
    const crypto = inject(CryptoService);
    const haptics = inject(HapticsService);
    const router = inject(Router);
    const translate = inject(TranslateService);
    const snack = inject(SnackService);
    const sensitiveLists = inject(SensitiveListsService);

    const bannered = new Set<string>();

    return {
        async fireReminderSnack(listId: string, itemId: string, reminderId: string): Promise<void> {
            if (bannered.has(reminderId)) return;
            bannered.add(reminderId);

            const known = store.knownLists().find(l => l.id === listId);
            if (known?.isSensitive && !sensitiveLists.revealed()) return;

            let text = translate.instant('SNACK.REMINDER_GENERIC', { listName: known?.name ?? '' });
            const key = store.currentEncryptionKey();
            if (listId === store.currentListId() && key) {
                const item = store.items().find(i => i.id === itemId);
                if (item) {
                    try {
                        text = await crypto.decrypt(item.encryptedPayload, item.initializationVector, key);
                    } catch { }
                }
            }

            haptics.reminderFired();
            snack.show({
                iconKind: 'reminder',
                text,
                autoDismissMs: null,
                goAction: {
                    label: translate.instant('SNACK.REMINDER_GO'),
                    run: () => void router.navigate(['/list', listId, 'items'], { queryParams: { highlight: itemId } }),
                },
                onDismiss: () => api.acknowledgeItemReminder(reminderId).subscribe({ error: () => { } }),
            });
        },

        fireListReminderSnack(listId: string, reminderId: string, remindAt: string): void {
            if (bannered.has(reminderId)) return;
            bannered.add(reminderId);

            const known = store.knownLists().find(l => l.id === listId);
            if (known?.isSensitive && !sensitiveLists.revealed()) return;

            haptics.reminderFired();
            snack.show({
                iconKind: 'reminder',
                text: translate.instant('SNACK.LIST_REMINDER', {
                    listName: known?.name ?? '',
                    dateTime: formatReminderDate(remindAt),
                }),
                autoDismissMs: null,
                goAction: {
                    label: translate.instant('SNACK.REMINDER_GO'),
                    run: () => void router.navigate(['/list', listId, 'items']),
                },
                onDismiss: () => api.acknowledgeListReminder(reminderId).subscribe({ error: () => { } }),
            });
        },
    };
}
