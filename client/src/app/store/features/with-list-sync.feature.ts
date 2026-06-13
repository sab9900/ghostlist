import { signalStoreFeature, type } from '@ngrx/signals';
import { KnownList } from '../../core/models';
import { withKnownLists } from './with-known-lists.feature';
import { withPairing } from './with-pairing.feature';
import { withReadReceipts } from './with-read-receipts.feature';

export function withListSync() {
    return signalStoreFeature(
        type<{
            state: {
                knownLists: KnownList[];
                currentListId: string | null;
                currentEncryptionKey: string | null;
                listsLoaded: boolean;
            };
        }>(),

        withKnownLists(),
        withPairing(),
        withReadReceipts(),
    );
}
