export interface WrappedListKey {
    iv: string;
    ciphertext: string;
}

export interface KnownList {
    id: string;
    encryptionKey: string;
    encryptionKeyWrapped?: WrappedListKey;
    name: string;
    addedAt: string;
    lastActivityAt?: string;
    ownerToken?: string;
    notifyOnMessage?: boolean;
    notifyOnItemsChanged?: boolean;
    notifyOnLethe?: boolean;
    notifyOnCharon?: boolean;
    notifyOnNemesis?: boolean;
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

export interface SyncBundleListEntry {
    id: string;
    name: string;
    encryptionKey: string;
    ownerToken?: string;
}

export interface SyncBundlePayload {
    lists: SyncBundleListEntry[];
    senderName: string | null;
    userId: string | null;

    userIdCreatedAt: string | null;
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
