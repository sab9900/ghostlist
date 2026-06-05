namespace GhostList.Domain.Entities;

public enum DeleteAfterDuration
{
    Immediately = 0,
    OneHour = 1,
    SixHours = 6,
    TwelveHours = 12,
    OneDay = 24,
    ThreeDays = 72,
    OneWeek = 168,
    OneMonth = 720,
    ThreeMonths = 2160
}

public class GhostList
{
    public Guid Id { get; private set; }
    public DeleteAfterDuration CompletedItemsTtl { get; private set; }
    public DateTime CreatedAt { get; private set; }

    public List<GhostListItem> Items { get; private set; } = [];
    public List<GhostChatMessage> ChatMessages { get; private set; } = [];

    private GhostList() { }

    public static GhostList Create(DeleteAfterDuration ttl = DeleteAfterDuration.OneDay)
    {
        return new GhostList
        {
            Id = Guid.NewGuid(),
            CompletedItemsTtl = ttl,
            CreatedAt = DateTime.UtcNow
        };
    }

    public void UpdateTtl(DeleteAfterDuration ttl)
    {
        CompletedItemsTtl = ttl;
    }

    public GhostListItem CreateListItem(string encryptedPayload, string initializationVector)
    {
        return GhostListItem.Create(Id, encryptedPayload, initializationVector);
    }

    public GhostChatMessage CreateMessage(
        string encryptedMessage,
        string initializationVector,
        string encryptedSenderName,
        string senderNameInitializationVector)
    {
        return GhostChatMessage.Create(
            Id,
            encryptedMessage,
            initializationVector,
            encryptedSenderName,
            senderNameInitializationVector
        );
    }
}
