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
  createdAt: string;
}
