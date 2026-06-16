namespace GhostList.Domain.Entities;

public class ItemReadReceipt
{
    public Guid ItemId { get; set; }

    public string DeviceId { get; set; } = string.Empty;

    public DateTimeOffset ReadAt { get; set; }
}
