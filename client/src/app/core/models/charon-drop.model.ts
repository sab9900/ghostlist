/**
 * A "burn after read" drop (Charon tab). The encrypted content/metadata are
 * persisted server-side until every other member of the list has viewed it
 * once, at which point it is permanently deleted.
 */
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
}
