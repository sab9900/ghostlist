import { DeleteAfterDuration } from './delete-after-duration.enum';
import { WhisperLifetime } from './whisper-lifetime.enum';
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

export type UpdateWhisperLifetimeRequest = WhisperLifetime;

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
    notifyOnLethe?: boolean;
    notifyOnCharon?: boolean;
    notifyOnNemesis?: boolean;
    locale?: string;
}

export interface CreateCharonDropRequest {
    ghostListId: string;
    encryptedContent: string;
    contentInitializationVector: string;
    encryptedMetadata: string;
    metadataInitializationVector: string;
}

export interface CreateItemReminderRequest {
    ghostListId: string;
    itemId: string;
    remindAt: string; // ISO-8601 UTC
}

export interface ItemReminderDto {
    id: string;
    itemId: string;
    remindAt: string; // ISO-8601 UTC
}

export interface CreateListReminderRequest {
    ghostListId: string;
    remindAt: string; // ISO-8601 UTC
}

export interface ListReminderDto {
    id: string;
    remindAt: string; // ISO-8601 UTC
}
