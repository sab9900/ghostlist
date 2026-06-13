export interface GhostListItemSummary {
    id: string;
    ghostListId: string;
    encryptedPayload: string;
    initializationVector: string;
    isChecked: boolean;
}

export interface GhostListItem extends GhostListItemSummary {
    checkedAt: string | null;
    createdAt: string;
    senderDeviceId: string | null;
    senderUserId: string | null;
}
