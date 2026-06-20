import { signalStoreFeature, type } from '@ngrx/signals';
import { GhostChatMessage, GhostList, GhostListItem, KnownList } from '../../core/models';
import { withKnownLists } from './with-known-lists.feature';
import { withListPersistence } from './with-list-persistence.feature';
import { withOfflineQueue } from './with-offline-queue.feature';
import { withPairing } from './with-pairing.feature';
import { withReadReceipts } from './with-read-receipts.feature';

export function withListSync() {
    return signalStoreFeature(
        type<{
            state: {
                knownLists: KnownList[];
                currentListId: string | null;
                currentEncryptionKey: string | null;
                currentList: GhostList | null;
                listsLoaded: boolean;
                items: GhostListItem[];
                messages: GhostChatMessage[];
                pendingOpsCount: number;
            };
        }>(),

        withKnownLists(),
        withPairing(),
        withReadReceipts(),
        withListPersistence(),
        withOfflineQueue(),
    );
}
