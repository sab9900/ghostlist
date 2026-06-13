export interface ItemCreatedEvent {
  id: string;
  ghostListId: string;
  encryptedPayload: string;
  initializationVector: string;
  isChecked: boolean;
  createdAt: string;
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
