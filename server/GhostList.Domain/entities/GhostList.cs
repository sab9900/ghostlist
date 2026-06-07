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

    /// <summary>
    /// SHA-256 hex hash of the owner's random token.
    /// Null for lists created before this feature was introduced (no ownership enforced).
    /// The server never sees the raw token — only its hash. Zero-knowledge compatible.
    /// </summary>
    public string? OwnerTokenHash { get; private set; }

    public List<GhostListItem> Items { get; private set; } = [];
    public List<GhostChatMessage> ChatMessages { get; private set; } = [];

    private GhostList() { }

    public static GhostList Create(
        DeleteAfterDuration ttl = DeleteAfterDuration.OneDay,
        string? ownerTokenHash = null)
    {
        return new GhostList
        {
            Id = Guid.NewGuid(),
            CompletedItemsTtl = ttl,
            CreatedAt = DateTime.UtcNow,
            OwnerTokenHash = ownerTokenHash,
        };
    }

    /// <summary>
    /// Returns true when the provided raw token matches the stored hash.
    /// Always returns true if no hash is stored (legacy list — no ownership enforced).
    /// </summary>
    public bool IsOwnerTokenValid(string? rawToken)
    {
        if (OwnerTokenHash is null) return true; // legacy list, no restriction
        if (rawToken is null) return false;

        var hashBytes = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(rawToken));
        var hash = Convert.ToHexString(hashBytes).ToLowerInvariant();
        return hash == OwnerTokenHash;
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
