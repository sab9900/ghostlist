import { DeleteAfterDuration } from './delete-after-duration.enum';
export interface CreateGhostListItemRequest {
    ghostListId: string;
    encryptedPayload: string;
    initializationVector: string;
}

export interface CreateGhostMessageRequest {
    ghostListId: string;
    encryptedMessage: string;
    messageInitializationVector: string;
    encryptedSenderName: string;
    senderNameInitializationVector: string;
}

export type UpdateTtlRequest = DeleteAfterDuration;
