export interface UnreadSummary {
    unreadMessageCount: number;
    unreadItemCount: number;
    unreadMessageIds: string[];
    unreadItemIds: string[];
    lastReadMessageAt: string | null;
    lastReadItemAt: string | null;
}
