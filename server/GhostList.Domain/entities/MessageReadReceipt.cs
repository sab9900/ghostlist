namespace GhostList.Domain.Entities;

/// <summary>
/// Records that a specific device has read a specific chat message.
/// Granular per-message receipts let the server compute exact unread counts
/// and the precise set of unread message ids, instead of relying on a single
/// forward-only "last read at" timestamp that gets advanced too eagerly.
/// Only the message id, device id and a timestamp are stored — no message
/// content — and the server already knows these ids (it stores the messages
/// themselves), so this stays zero-knowledge compatible.
/// </summary>
public class MessageReadReceipt
{
    public Guid MessageId { get; set; }

    /// <summary>Device that read the message.</summary>
    public string DeviceId { get; set; } = string.Empty;

    public DateTimeOffset ReadAt { get; set; }
}
