export interface DecryptedMessage {
    id: string;
    text: string;
    senderName: string;
    createdAt: string;
    replyToMessageId: string | null;
    isImage: boolean;
    isAudio: boolean;
    isVideo: boolean;
    senderDeviceId: string | null;
    senderUserId: string | null;
}

export interface ReplyPreview {
    senderName: string;
    text: string;
    isImage: boolean;
    isAudio: boolean;
    isVideo: boolean;
}
