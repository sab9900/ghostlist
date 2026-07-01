namespace GhostList.Domain.Entities;

public class NemesisSettlement
{
    public Guid Id { get; private set; }
    public Guid GhostListId { get; private set; }

    public string EncryptedPayload { get; private set; } = null!;
    public string PayloadInitializationVector { get; private set; } = null!;

    public SettlementStatus Status { get; private set; }

    public bool IsPaidByPayer { get; private set; }
    public bool IsConfirmedByReceiver { get; private set; }

    public DateTime? PaidAt { get; private set; }
    public DateTime? ConfirmedAt { get; private set; }
    public DateTime? ResolvedAt { get; private set; }

    public string? PayerDeviceId { get; private set; }
    public string? PayerUserId { get; private set; }
    public string? ReceiverUserId { get; private set; }

    public DateTime CreatedAt { get; private set; }

    private NemesisSettlement() { }

    public static NemesisSettlement Create(
        Guid ghostListId,
        string encryptedPayload,
        string payloadInitializationVector,
        string? payerDeviceId = null,
        string? payerUserId = null,
        string? receiverUserId = null)
    {
        return new NemesisSettlement
        {
            Id = Guid.NewGuid(),
            GhostListId = ghostListId,
            EncryptedPayload = encryptedPayload,
            PayloadInitializationVector = payloadInitializationVector,
            Status = SettlementStatus.Pending,
            IsPaidByPayer = true,
            IsConfirmedByReceiver = false,
            PaidAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            PayerDeviceId = payerDeviceId,
            PayerUserId = payerUserId,
            ReceiverUserId = receiverUserId,
        };
    }

    public void ConfirmReceipt()
    {
        if (Status != SettlementStatus.Pending)
            throw new InvalidOperationException("Settlement is not pending.");

        Status = SettlementStatus.Confirmed;
        IsConfirmedByReceiver = true;
        ConfirmedAt = DateTime.UtcNow;
        ResolvedAt = DateTime.UtcNow;
    }

    public void Decline()
    {
        if (Status != SettlementStatus.Pending)
            throw new InvalidOperationException("Settlement is not pending.");

        Status = SettlementStatus.Declined;
        ResolvedAt = DateTime.UtcNow;
    }

    public void Expire()
    {
        if (Status != SettlementStatus.Pending)
            throw new InvalidOperationException("Settlement is not pending.");

        Status = SettlementStatus.Expired;
        ResolvedAt = DateTime.UtcNow;
    }

    public void Void()
    {
        if (Status != SettlementStatus.Pending)
            throw new InvalidOperationException("Settlement is not pending.");

        Status = SettlementStatus.Voided;
        ResolvedAt = DateTime.UtcNow;
    }

    public void Forgive()
    {
        if (Status != SettlementStatus.Pending)
            throw new InvalidOperationException("Settlement is not pending.");

        Status = SettlementStatus.Forgiven;
        ResolvedAt = DateTime.UtcNow;
    }
}
