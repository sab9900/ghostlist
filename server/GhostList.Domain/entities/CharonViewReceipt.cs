namespace GhostList.Domain.Entities;

public class CharonViewReceipt
{
    public Guid DropId { get; set; }

    public string DeviceId { get; set; } = string.Empty;

    public string? UserId { get; set; }

    public DateTimeOffset ViewedAt { get; set; }
}
