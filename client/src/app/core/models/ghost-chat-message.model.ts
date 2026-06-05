/**
 * Returned by GET /api/ghostlist/{id} (nested) and GET /api/chat/{listId},
 * and echoed in SignalR MessageReceived events.
 */
export interface GhostChatMessage {
  id: string;
  encryptedMessage: string;
  messageInitializationVector: string;
  encryptedSenderName: string;
  senderNameInitializationVector: string;
  createdAt: string;
}
