export interface KnownList {

  id: string;

  encryptionKey: string;

  name: string;

  addedAt: string;

  /**
   * Raw owner token — present only on the device that created the list (and devices it was synced to).
   * The server stores only SHA-256(ownerToken); the raw value never leaves the client.
   * Absence means this device joined as a member, not the creator.
   */
  ownerToken?: string;
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

  /** Receiver's ECDH public key (base64). */
  publicKey: string;

  sessionId: string;
}

/** QR payload for sender-initiated sync (mirrors ExportQrPayload for individual lists).
 *  The QR contains NO crypto material — the receiver scans, generates a keypair,
 *  and posts its public key as a handshake. */
export interface SyncSendQrPayload {

  type: 'sync-send';

  sessionId: string;
}

/** Decrypted member record — built client-side after fetching + decrypting from server. */
export interface ListMember {
  deviceId: string;
  displayName: string;
  joinedAt: string;
  isCurrentDevice: boolean;
}
