export interface GhostChatMessage {
    id: string;
    ghostListId: string;
    encryptedMessage: string;
    messageInitializationVector: string;
    encryptedSenderName: string;
    senderNameInitializationVector: string;
    replyToMessageId: string | null;
    createdAt: string;
}
