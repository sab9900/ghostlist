export interface GhostListItemSummary {
    id: string;
    ghostListId: string;
    encryptedPayload: string;
    initializationVector: string;
    isChecked: boolean;
    priority: number;
}

export interface GhostListItem extends GhostListItemSummary {
    checkedAt: string | null;
    createdAt: string;
    senderDeviceId: string | null;
    senderUserId: string | null;
    checkedByDeviceId: string | null;
    checkedByUserId: string | null;
}
