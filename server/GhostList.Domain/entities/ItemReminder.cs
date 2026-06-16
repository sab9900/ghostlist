using System;

namespace GhostList.Domain.Entities;

public class ItemReminder
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }

    /// <summary>Informational reference to the item — NOT a FK, item may be deleted before reminder fires.</summary>
    public Guid ItemId { get; private set; }

    /// <summary>Device that set the reminder and should receive the push.</summary>
    public string DeviceId { get; private set; } = null!;

    public DateTime RemindAt { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public bool IsSent { get; private set; }

    /// <summary>True once the user has dismissed the in-app reminder banner. Hides the reminder from the GET list.</summary>
    public bool IsAcknowledged { get; private set; }

    private ItemReminder() { }

    public static ItemReminder Create(Guid ghostListId, Guid itemId, string deviceId, DateTime remindAt) =>
        new()
        {
            Id = Guid.NewGuid(),
            GhostListId = ghostListId,
            ItemId = itemId,
            DeviceId = deviceId,
            RemindAt = remindAt,
            CreatedAt = DateTime.UtcNow,
            IsSent = false,
            IsAcknowledged = false,
        };

    public void MarkSent() => IsSent = true;

    public void MarkAcknowledged() => IsAcknowledged = true;
}
