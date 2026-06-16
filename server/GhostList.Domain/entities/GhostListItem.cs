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

    public string? SenderDeviceId { get; private set; }

    public string? SenderUserId { get; private set; }

    public string? CheckedByDeviceId { get; private set; }

    public string? CheckedByUserId { get; private set; }

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

    public void ToggleChecked(string? checkedByDeviceId = null, string? checkedByUserId = null)
    {
        IsChecked = !IsChecked;
        CheckedAt = IsChecked ? DateTime.UtcNow : (DateTime?)null;
        CheckedByDeviceId = IsChecked ? checkedByDeviceId : null;
        CheckedByUserId = IsChecked ? checkedByUserId : null;
    }
}
