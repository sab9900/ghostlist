using System;

namespace GhostList.Domain.Entities;

public class GhostListItem
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }
    public string EncryptedPayload { get; private set; } = null!;
    public string InitializationVector { get; private set; } = null!;
    public bool IsChecked { get; private set; }
    public DateTime? CheckedAt { get; private set; }
    public DateTime CreatedAt { get; private set; }

    /// <summary>
    /// Id of the device that created this item. Used so clients can recognize
    /// their own contributions (e.g. to suppress "new" indicators and exclude
    /// them from unread counts) without any local-only bookkeeping.
    /// </summary>
    public string? SenderDeviceId { get; private set; }

    /// <summary>
    /// Stable "person" identity of whoever created this item, distinct from
    /// <see cref="SenderDeviceId"/> (per-installation). Survives machine sync,
    /// so a person's own items are recognized as "mine" on every device they use.
    /// Null for rows created before this field existed (legacy fallback to
    /// <see cref="SenderDeviceId"/> on the client).
    /// </summary>
    public string? SenderUserId { get; private set; }

    private GhostListItem() { }

    public static GhostListItem Create(Guid ghostListId, string encryptedPayload, string initializationVector, string? senderDeviceId = null, string? senderUserId = null)
    {
        return new GhostListItem
        {
            Id = Guid.NewGuid(),
            GhostListId = ghostListId,
            EncryptedPayload = encryptedPayload,
            InitializationVector = initializationVector,
            IsChecked = false,
            CreatedAt = DateTime.UtcNow,
            SenderDeviceId = senderDeviceId,
            SenderUserId = senderUserId
        };
    }

    public void ToggleChecked()
    {
        IsChecked = !IsChecked;
        CheckedAt = IsChecked ? DateTime.UtcNow : (DateTime?)null;
    }
}
