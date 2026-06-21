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

export interface GhostMessageImageDto {
    messageId: string;
    encryptedImage: string;
    imageInitializationVector: string;
}

export interface GhostMessageAudioDto {
    messageId: string;
    encryptedAudio: string;
    audioInitializationVector: string;
}

export interface GhostMessageVideoDto {
    messageId: string;
    encryptedVideo: string;
    videoInitializationVector: string;
}
