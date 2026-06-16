namespace GhostList.Domain.Entities;

public class MessageReadReceipt
{
    public Guid MessageId { get; set; }

    public string DeviceId { get; set; } = string.Empty;

    public DateTimeOffset ReadAt { get; set; }
}
