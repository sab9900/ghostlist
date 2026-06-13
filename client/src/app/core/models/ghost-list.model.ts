import { GhostChatMessage } from './ghost-chat-message.model';
import { GhostListItem } from './ghost-list-item.model';

export interface GhostList {
    id: string;
    ttl: number;
    createdAt: string;
    items: GhostListItem[];
    chatMessages: GhostChatMessage[];
}
