namespace GhostList.Domain.Entities;

public class CharonViewReceipt
{
    public Guid DropId { get; set; }

    public string DeviceId { get; set; } = string.Empty;

    public DateTimeOffset ViewedAt { get; set; }
}
