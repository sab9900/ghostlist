export interface KnownList {

  id: string;

  encryptionKey: string;

  name: string;

  addedAt: string;
}

export interface ReceiveQrPayload {

  publicKey: string;

  sessionId: string;
}

export interface ShareDelivery {

  wrappedKey: string;

  senderPublicKey: string;

  listId: string;
}
