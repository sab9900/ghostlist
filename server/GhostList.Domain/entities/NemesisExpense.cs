using GhostList.Domain.ValueObjects;

namespace GhostList.Domain.Entities;

public class NemesisExpense
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }

    public string EncryptedPayload { get; private set; } = null!;
    public string PayloadInitializationVector { get; private set; } = null!;

    public string? EncryptedReceiptKey { get; private set; }
    public string? ReceiptBlobKey { get; private set; }

    public VerificationStatus Status { get; private set; }
    public int SplitCount { get; private set; }
    public bool IsArchived { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public string? CreatedByDeviceId { get; private set; }
    public string? CreatedByUserId { get; private set; }

    private readonly List<NemesisVerification> _verifications = [];
    public IReadOnlyList<NemesisVerification> Verifications => _verifications.AsReadOnly();

    private NemesisExpense() { }

    public static NemesisExpense Create(
        Guid ghostListId,
        string encryptedPayload,
        string payloadInitializationVector,
        int splitCount,
        string? createdByDeviceId = null,
        string? createdByUserId = null)
    {
        var alreadyVerified = splitCount == 0;
        return new NemesisExpense
        {
            Id = Guid.NewGuid(),
            GhostListId = ghostListId,
            EncryptedPayload = encryptedPayload,
            PayloadInitializationVector = payloadInitializationVector,
            Status = alreadyVerified ? VerificationStatus.Verified : VerificationStatus.Pending,
            SplitCount = splitCount,
            IsArchived = alreadyVerified,
            CreatedAt = DateTime.UtcNow,
            CreatedByDeviceId = createdByDeviceId,
            CreatedByUserId = createdByUserId,
        };
    }

    public void AddVerification(string verifiedByUserId)
    {
        if (Status != VerificationStatus.Pending)
            throw new InvalidOperationException("Only pending expenses can be verified.");

        if (_verifications.Any(v => v.VerifiedByUserId == verifiedByUserId))
            return;

        _verifications.Add(NemesisVerification.Create(Id, verifiedByUserId));

        if (_verifications.Count >= SplitCount)
        {
            Status = VerificationStatus.Verified;
            IsArchived = true;
        }
    }

    public void Reject()
    {
        if (Status != VerificationStatus.Pending)
            throw new InvalidOperationException("Only pending expenses can be rejected.");

        Status = VerificationStatus.Rejected;
        IsArchived = true;
    }

    public void Archive()
    {
        IsArchived = true;
    }

    public void AttachReceipt(string encryptedReceiptKey, string receiptBlobKey)
    {
        EncryptedReceiptKey = encryptedReceiptKey;
        ReceiptBlobKey = receiptBlobKey;
    }
}
