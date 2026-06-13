import { GhostChatMessage } from './ghost-chat-message.model';
import { GhostListItem } from './ghost-list-item.model';
import { CreateGhostListItemRequest, CreateGhostMessageRequest } from './requests.model';

/** Snapshot of a list's content, persisted locally so it can be viewed offline. */
export interface CachedList {
    id: string;
    ttl: number;
    createdAt: string;
    items: GhostListItem[];
    messages: GhostChatMessage[];
    cachedAt: string;
}

/** A mutation that couldn't reach the server and is queued for replay once back online. */
export type PendingOperation =
    | {
        localId?: number;
        type: 'createItem';
        listId: string;
        tempItemId: string;
        payload: CreateGhostListItemRequest;
        createdAt: string;
    }
    | {
        localId?: number;
        type: 'toggleItem';
        listId: string;
        itemId: string;
        /** The checked state the user wants this item to end up in. */
        desiredChecked: boolean;
        createdAt: string;
    }
    | {
        localId?: number;
        type: 'deleteItem';
        listId: string;
        itemId: string;
        createdAt: string;
    }
    | {
        localId?: number;
        type: 'sendMessage';
        listId: string;
        tempMessageId: string;
        payload: CreateGhostMessageRequest;
        createdAt: string;
    }
    | {
        localId?: number;
        type: 'deleteMessage';
        listId: string;
        messageId: string;
        createdAt: string;
    };
