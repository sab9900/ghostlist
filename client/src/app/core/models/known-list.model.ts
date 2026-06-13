export interface KnownList {

  id: string;

  encryptionKey: string;

  name: string;

  addedAt: string;

  ownerToken?: string;

  /** Push: notify this device on new chat messages in this list. Default (undefined) = true. */
  notifyOnMessage?: boolean;

  /** Push: notify this device when items in this list change (added/checked/removed). Default (undefined) = false (opt-in). */
  notifyOnItemsChanged?: boolean;
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
