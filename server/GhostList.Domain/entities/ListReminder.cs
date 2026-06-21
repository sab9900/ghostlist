using System;

namespace GhostList.Domain.Entities;

public class ListReminder
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }
    public string DeviceId { get; private set; } = null!;
    public DateTime RemindAt { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public bool IsSent { get; private set; }
    public bool IsAcknowledged { get; private set; }

    private ListReminder() { }

    public static ListReminder Create(Guid ghostListId, string deviceId, DateTime remindAt) =>
        new()
        {
            Id = Guid.NewGuid(),
            GhostListId = ghostListId,
            DeviceId = deviceId,
            RemindAt = remindAt,
            CreatedAt = DateTime.UtcNow,
            IsSent = false,
            IsAcknowledged = false,
        };

    public void MarkSent() => IsSent = true;

    public void MarkAcknowledged() => IsAcknowledged = true;
}
