/**
 * SignalR event payloads pushed by the server over /hubs/ghostlist.
 *
 * Event names (as registered with SendAsync on the server):
 *   "ItemCreated"    → ItemCreatedEvent
 *   "ItemToggled"    → ItemToggledEvent
 *   "ItemDeleted"    → string (item id)
 *   "MessageReceived" → MessageCreatedEvent
 *   "MessageDeleted" → string (message id)
 *   "TtlUpdated"     → number (new TTL integer value)
 */

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
