namespace GhostList.Domain.Entities;

/// <summary>
/// Records that a specific device has viewed (and thus burned) a specific
/// <see cref="CharonDrop"/>. Once every other current <see cref="GhostListMember"/>
/// of the drop's list has a receipt, the drop (and its receipts) are deleted —
/// see <c>MarkCharonDropViewedCommand</c>. Only the drop id, device id and a
/// timestamp are stored — no content — staying zero-knowledge compatible.
/// </summary>
public class CharonViewReceipt
{
    public Guid DropId { get; set; }

    /// <summary>Device that viewed (and burned) the drop.</summary>
    public string DeviceId { get; set; } = string.Empty;

    public DateTimeOffset ViewedAt { get; set; }
}
