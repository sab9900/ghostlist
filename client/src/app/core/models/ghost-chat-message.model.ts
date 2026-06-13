export interface GhostChatMessage {
    id: string;
    ghostListId: string;
    encryptedMessage: string;
    messageInitializationVector: string;
    encryptedSenderName: string;
    senderNameInitializationVector: string;
    replyToMessageId: string | null;
    createdAt: string;
    senderDeviceId: string | null;
    senderUserId: string | null;
}

/**
 * Temporarily-stored encrypted image blob for a chat message, fetched
 * on-demand when a device wasn't connected to receive the live SignalR
 * relay. See `ApiService.getMessageImage`.
 */
export interface GhostMessageImageDto {
    messageId: string;
    encryptedImage: string;
    imageInitializationVector: string;
}
