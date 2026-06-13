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
    replyToMessageId?: string | null;
}

export type UpdateTtlRequest = DeleteAfterDuration;

export interface ReadReceiptRequest {
    lastReadMessageAt?: string | null;
    lastReadItemAt?: string | null;
}

/** Body for the granular per-message/per-item "mark as read" endpoints. */
export interface MarkReadRequest {
    ids: string[];
}

/** Mirrors GhostList.Domain.Entities.DevicePlatform (serialized as a string). */
export type DevicePlatformDto = 'Ios' | 'Android' | 'Web';

export interface SubscribeRequest {
    deviceToken: string;
    platform: DevicePlatformDto;
    notifyOnMessage?: boolean;
    notifyOnItemsChanged?: boolean;
}
