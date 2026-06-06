namespace GhostList.Application.Common.Interfaces;

public interface IPushNotificationService
{
    Task SendItemNotificationAsync(Guid listId, string? senderToken, CancellationToken ct);
    Task SendMessageNotificationAsync(Guid listId, string? senderToken, CancellationToken ct);
}
