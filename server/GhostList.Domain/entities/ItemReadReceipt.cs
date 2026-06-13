namespace GhostList.Domain.Entities;

/// <summary>
/// Records that a specific device has read (seen) a specific list item.
/// Granular per-item receipts let the server compute exact unread counts and
/// the precise set of unread item ids, instead of relying on a single
/// forward-only "last read at" timestamp that gets advanced too eagerly.
/// Only the item id, device id and a timestamp are stored — no item content —
/// and the server already knows these ids (it stores the items themselves),
/// so this stays zero-knowledge compatible.
/// </summary>
public class ItemReadReceipt
{
    public Guid ItemId { get; set; }

    /// <summary>Device that read (saw) the item.</summary>
    public string DeviceId { get; set; } = string.Empty;

    public DateTimeOffset ReadAt { get; set; }
}
