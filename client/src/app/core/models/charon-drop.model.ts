
export interface CharonDropDto {
    id: string;
    ghostListId: string;
    encryptedContent: string;
    contentInitializationVector: string;
    encryptedMetadata: string;
    metadataInitializationVector: string;
    createdAt: string;
    senderDeviceId: string | null;
    senderUserId: string | null;
    viewerIds: string[];
}
