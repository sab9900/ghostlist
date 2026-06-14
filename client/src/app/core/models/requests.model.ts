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

export interface MarkReadRequest {
    ids: string[];
}

export type DevicePlatformDto = 'Ios' | 'Android' | 'Web';

export interface SubscribeRequest {
    deviceToken: string;
    platform: DevicePlatformDto;
    notifyOnMessage?: boolean;
    notifyOnItemsChanged?: boolean;
}

export interface CreateCharonDropRequest {
    ghostListId: string;
    encryptedContent: string;
    contentInitializationVector: string;
    encryptedMetadata: string;
    metadataInitializationVector: string;
}
