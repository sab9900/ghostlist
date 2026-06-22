import { HttpErrorResponse } from '@angular/common/http';
import { GhostChatMessage, GhostListItem } from '../core/models';

export function isNetworkError(e: unknown): boolean {
    return e instanceof HttpErrorResponse && e.status === 0;
}

export function tempId(): string {
    return `local-${self.crypto.randomUUID()}`;
}

export function resolveCreatedItemId(items: GhostListItem[], tempItemId: string, realId: string): GhostListItem[] {
    if (items.some(i => i.id === realId)) {
        return items.filter(i => i.id !== tempItemId);
    }
    return items.map(i => i.id === tempItemId ? { ...i, id: realId } : i);
}

export function resolveCreatedMessageId(messages: GhostChatMessage[], tempMessageId: string, realId: string): GhostChatMessage[] {
    if (messages.some(m => m.id === realId)) {
        return messages.filter(m => m.id !== tempMessageId);
    }
    return messages.map(m => m.id === tempMessageId ? { ...m, id: realId } : m);
}

export function mergeRecentMessagesPage(existing: GhostChatMessage[], recentPage: GhostChatMessage[]): GhostChatMessage[] {
    if (recentPage.length === 0) return [];
    const recentIds = new Set(recentPage.map(m => m.id));
    const oldestRecentCreatedAt = recentPage[0].createdAt;
    const olderRetained = existing.filter(m => !recentIds.has(m.id) && m.createdAt < oldestRecentCreatedAt);
    return [...olderRetained, ...recentPage];
}
