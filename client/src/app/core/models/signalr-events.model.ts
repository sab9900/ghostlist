export interface ItemCreatedEvent {
  id: string;
  ghostListId: string;
  encryptedPayload: string;
  initializationVector: string;
  isChecked: boolean;
  createdAt: string;
  senderDeviceId: string | null;
  senderUserId: string | null;
}

export interface ItemToggledEvent {
  itemId: string;
  isChecked: boolean;
  checkedAt: string | null;
}

export interface MessageCreatedEvent {
  id: string;
  ghostListId: string;
  encryptedMessage: string;
  initializationVector: string;
  encryptedSenderName: string;
  senderNameInitializationVector: string;
  replyToMessageId: string | null;
  createdAt: string;
  senderDeviceId: string | null;
  senderUserId: string | null;
}

export interface ImageSharedEvent {
  messageId: string;
  ghostListId: string;
  encryptedImage: string;
  imageInitializationVector: string;
  senderConnectionId: string;
}

export interface ReadReceiptUpdatedEvent {
  ghostListId: string;
  deviceId: string;
  lastReadMessageAt: string | null;
}

/** A live, never-persisted "whisper" message relayed to everyone currently viewing the Whisper tab. */
export interface WhisperReceivedEvent {
  listId: string;
  ciphertext: string;
  iv: string;
  senderCiphertext: string;
  senderIv: string;
}

/** One entry in a Whisper room's live presence roster. */
export interface WhisperPresenceEntry {
  deviceId: string;
  displayName: string;
}

/** A new "burn after read" drop was created (Charon tab). */
export interface CharonDropCreatedEvent {
  id: string;
  ghostListId: string;
  encryptedContent: string;
  contentInitializationVector: string;
  encryptedMetadata: string;
  metadataInitializationVector: string;
  createdAt: string;
  senderDeviceId: string | null;
  senderUserId: string | null;
}
