export interface ItemCreatedEvent {
    id: string;
    ghostListId: string;
    encryptedPayload: string;
    initializationVector: string;
    isChecked: boolean;
    createdAt: string;
    senderDeviceId: string | null;
    senderUserId: string | null;
}

export interface ItemToggledEvent {
    itemId: string;
    isChecked: boolean;
    checkedAt: string | null;
    checkedByDeviceId: string | null;
    checkedByUserId: string | null;
}

export interface ItemPriorityChangedEvent {
    itemId: string;
    priority: number;
}

export interface MessageCreatedEvent {
    id: string;
    ghostListId: string;
    encryptedMessage: string;
    initializationVector: string;
    encryptedSenderName: string;
    senderNameInitializationVector: string;
    replyToMessageId: string | null;
    createdAt: string;
    senderDeviceId: string | null;
    senderUserId: string | null;
}

export interface ImageSharedEvent {
    messageId: string;
    ghostListId: string;
    encryptedImage: string;
    imageInitializationVector: string;
    senderConnectionId: string;
}

export interface ReadReceiptUpdatedEvent {
    ghostListId: string;
    deviceId: string;
    lastReadMessageAt: string | null;
}

export interface WhisperReceivedEvent {
    listId: string;
    ciphertext: string;
    iv: string;
    senderCiphertext: string;
    senderIv: string;
}

export interface WhisperPresenceEntry {
    deviceId: string;
    displayName: string;
}
export interface AudioSharedEvent {
    messageId: string;
    ghostListId: string;
    encryptedAudio: string;
    audioInitializationVector: string;
    senderConnectionId: string;
}

export interface VideoSharedEvent {
    messageId: string;
    ghostListId: string;
    encryptedVideo: string;
    videoInitializationVector: string;
    senderConnectionId: string;
}

export interface ReminderFiredEvent {
    listId: string;
    itemId: string;
    reminderId: string;
}

export interface ListReminderFiredEvent {
    listId: string;
    reminderId: string;
    remindAt: string;
}

export interface TypingIndicatorEvent {
    listId: string;
    encryptedName: string;
    nameIv: string;
}

export interface WhisperInviteReceivedEvent {
    listId: string;
    senderDeviceId: string | null;
    targetDeviceIds: string[] | null;
}

export interface CharonDropCreatedEvent {
    id: string;
    ghostListId: string;
    encryptedContent: string;
    contentInitializationVector: string;
    encryptedMetadata: string;
    metadataInitializationVector: string;
    createdAt: string;
    senderDeviceId: string | null;
    senderUserId: string | null;
}

export interface NemesisExpenseCreatedEvent {
    id: string;
    ghostListId: string;
    encryptedPayload: string;
    payloadInitializationVector: string;
    status: string;
    splitCount: number;
    createdAt: string;
    createdByDeviceId: string | null;
    createdByUserId: string | null;
    encryptedReceiptKey: string | null;
    receiptBlobKey: string | null;
    verifications: { verifiedByUserId: string; verifiedAt: string }[];
}

export interface NemesisExpenseVerifiedEvent {
    expenseId: string;
    ghostListId: string;
    status: string;
    verifiedByUserId: string;
}

export interface NemesisSettlementCreatedEvent {
    id: string;
    ghostListId: string;
    encryptedPayload: string;
    payloadInitializationVector: string;
    isPaidByPayer: boolean;
    isConfirmedByReceiver: boolean;
    paidAt: string | null;
    payerDeviceId: string | null;
    payerUserId: string | null;
    receiverUserId: string | null;
}

export interface NemesisSettlementConfirmedEvent {
    settlementId: string;
    ghostListId: string;
    confirmedAt: string;
}

export interface NemesisSettlementDeclinedEvent {
    settlementId: string;
    ghostListId: string;
}

export interface NemesisExpenseArchivedEvent {
    expenseId: string;
    ghostListId: string;
}

export interface NemesisExpenseUpdatedEvent {
    id: string;
    ghostListId: string;
    encryptedPayload: string;
    payloadInitializationVector: string;
    status: string;
    splitCount: number;
    isArchived: boolean;
    createdAt: string;
    createdByDeviceId: string | null;
    createdByUserId: string | null;
    encryptedReceiptKey: string | null;
    receiptBlobKey: string | null;
    verifications: { verifiedByUserId: string; verifiedAt: string }[];
}

export interface NemesisExpenseDeletedEvent {
    expenseId: string;
    ghostListId: string;
}

export interface NemesisSettlementVoidedEvent {
    settlementId: string;
    ghostListId: string;
}

export interface NemesisSettlementExpiredEvent {
    settlementId: string;
    ghostListId: string;
}

export interface NemesisSettlementForgivenEvent {
    settlementId: string;
    ghostListId: string;
}

export interface NemesisSettlementExpiringEvent {
    settlementId: string;
    ghostListId: string;
    daysLeft: number;
}

export interface NemesisLedgerPurgedEvent {
    ghostListId: string;
}

export interface ReactionChangedEvent {
    reactionId: string;
    messageId: string;
    ghostListId: string;
    encryptedEmoji: string;
    emojiInitializationVector: string;
    encryptedSenderName: string;
    senderNameInitializationVector: string;
    senderDeviceId: string | null;
    senderUserId: string | null;
    removed: boolean;
}
