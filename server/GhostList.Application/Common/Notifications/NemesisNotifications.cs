using GhostList.Domain.Entities;

namespace GhostList.Application.Common.Notifications;

public record NemesisExpenseVerificationRecord(string VerifiedByUserId, DateTime VerifiedAt);

public record NemesisExpenseCreatedNotification(
    Guid Id,
    Guid GhostListId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    VerificationStatus Status,
    int SplitCount,
    DateTime CreatedAt,
    string? CreatedByDeviceId,
    string? CreatedByUserId,
    string? EncryptedReceiptKey,
    string? ReceiptBlobKey,
    IReadOnlyList<NemesisExpenseVerificationRecord> Verifications);

public record NemesisExpenseVerifiedNotification(
    Guid ExpenseId,
    Guid GhostListId,
    VerificationStatus Status,
    string VerifiedByUserId);

public record NemesisSettlementCreatedNotification(
    Guid Id,
    Guid GhostListId,
    string EncryptedPayload,
    string PayloadInitializationVector,
    bool IsPaidByPayer,
    bool IsConfirmedByReceiver,
    DateTime? PaidAt,
    string? PayerDeviceId,
    string? PayerUserId);

public record NemesisSettlementConfirmedNotification(
    Guid SettlementId,
    Guid GhostListId,
    DateTime ConfirmedAt);

public record NemesisSettlementDeclinedNotification(
    Guid SettlementId,
    Guid GhostListId);

public record NemesisExpenseArchivedNotification(
    Guid ExpenseId,
    Guid GhostListId);

public record NemesisSettlementVoidedNotification(
    Guid SettlementId,
    Guid GhostListId);

public record NemesisSettlementExpiredNotification(
    Guid SettlementId,
    Guid GhostListId);

public record NemesisSettlementForgivenNotification(
    Guid SettlementId,
    Guid GhostListId);

public record NemesisSettlementExpiringNotification(
    Guid SettlementId,
    Guid GhostListId,
    int DaysLeft);
