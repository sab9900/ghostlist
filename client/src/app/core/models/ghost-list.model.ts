import { GhostChatMessage } from './ghost-chat-message.model';
import { GhostListItemSummary } from './ghost-list-item.model';

export interface GhostList {
    id: string;
    ttl: number;
    createdAt: string;
    items: GhostListItemSummary[];
    chatMessages: GhostChatMessage[];
}
