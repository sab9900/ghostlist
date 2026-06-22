import { GhostChatMessage } from './ghost-chat-message.model';
import { GhostListItem } from './ghost-list-item.model';
import { CreateGhostListItemRequest, CreateGhostMessageRequest } from './requests.model';

export interface CachedList {
    id: string;
    ttl: number;
    whisperLifetimeSeconds: number;
    createdAt: string;
    items: GhostListItem[];
    messages: GhostChatMessage[];
    hasMoreMessages: boolean;
    cachedAt: string;
}

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
