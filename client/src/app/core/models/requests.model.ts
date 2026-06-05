import { DeleteAfterDuration } from './delete-after-duration.enum';

/** POST /api/ghostitems */
export interface CreateGhostListItemRequest {
  ghostListId: string;
  encryptedPayload: string;
  initializationVector: string;
}

/** POST /api/chat */
export interface CreateGhostMessageRequest {
  ghostListId: string;
  encryptedMessage: string;
  messageInitializationVector: string;
  encryptedSenderName: string;
  senderNameInitializationVector: string;
}

/**
 * PATCH /api/ghostlist/{id}/ttl
 * Body is the enum string value directly (e.g. "OneDay"), not wrapped in an object.
 */
export type UpdateTtlRequest = DeleteAfterDuration;
