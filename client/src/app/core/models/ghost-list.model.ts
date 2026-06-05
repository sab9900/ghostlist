import { GhostChatMessage } from './ghost-chat-message.model';
import { GhostListItemSummary } from './ghost-list-item.model';

/**
 * Returned by GET /api/ghostlist/{id}.
 * ttl is the raw integer value of DeleteAfterDuration — use TTL_VALUE_TO_ENUM to convert.
 */
export interface GhostList {
  id: string;
  ttl: number;
  createdAt: string;
  items: GhostListItemSummary[];
  chatMessages: GhostChatMessage[];
}
