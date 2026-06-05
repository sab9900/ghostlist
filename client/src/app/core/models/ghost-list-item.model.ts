/**
 * Slim projection returned as part of GhostListDto (GET /api/ghostlist/{id}).
 */
export interface GhostListItemSummary {
  id: string;
  encryptedPayload: string;
  initializationVector: string;
  isChecked: boolean;
}

/**
 * Full projection returned by GET /api/ghostitems/{listId}
 * and echoed in SignalR ItemCreated events.
 */
export interface GhostListItem extends GhostListItemSummary {
  checkedAt: string | null;
  createdAt: string;
}
