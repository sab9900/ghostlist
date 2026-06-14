export interface KnownList {
    id: string;
    encryptionKey: string;
    name: string;
    addedAt: string;
    ownerToken?: string;
    notifyOnMessage?: boolean;
    notifyOnItemsChanged?: boolean;
    isSensitive?: boolean;
}

export interface ReceiveQrPayload {
    publicKey: string;
    sessionId: string;
}

export interface ShareDelivery {
    wrappedKey: string;
    senderPublicKey: string;
    listId: string;
    listName: string;
}

export interface ExportQrPayload {
    type: 'export';
    sessionId: string;
    listId: string;
    listName: string;
}

export interface SyncQrPayload {
    type: 'sync';
    publicKey: string;
    sessionId: string;
}

export interface SyncSendQrPayload {
    type: 'sync-send';
    sessionId: string;
}

export interface ListMember {
    deviceId: string;
    userId: string | null;
    displayName: string;
    joinedAt: string;
    isCurrentDevice: boolean;
    isCurrentUser: boolean;
    lastReadMessageAt: string | null;
}
