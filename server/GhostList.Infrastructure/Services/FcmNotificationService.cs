using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using GhostList.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Infrastructure.Services;

public class FcmNotificationService(IApplicationDbContext context) : IPushNotificationService
{
    public Task SendItemNotificationAsync(Guid listId, string? senderToken, CancellationToken ct) =>
        SendAsync(listId, senderToken,
            body: "New item added to your list",
            type: "item",
            ct);

    public Task SendMessageNotificationAsync(Guid listId, string? senderToken, CancellationToken ct) =>
        SendAsync(listId, senderToken,
            body: "New message in your list",
            type: "message",
            ct);

    private async Task SendAsync(Guid listId, string? senderToken, string body, string type, CancellationToken ct)
    {
        if (FirebaseApp.DefaultInstance is null) return;

        var tokens = await context.DeviceSubscriptions
            .Where(s => s.ListId == listId &&
                        (senderToken == null || s.DeviceToken != senderToken))
            .Select(s => s.DeviceToken)
            .Distinct()
            .ToListAsync(ct);

        if (tokens.Count == 0) return;

        var message = new MulticastMessage
        {
            Tokens = tokens,
            Notification = new Notification
            {
                Title = "GhostList",
                Body = body,
            },
            Data = new Dictionary<string, string>
            {
                ["listId"] = listId.ToString(),
                ["type"] = type,
            },
            Apns = new ApnsConfig
            {
                Aps = new Aps { Sound = "default" },
            },
        };

        var response = await FirebaseMessaging.DefaultInstance.SendEachForMulticastAsync(message, ct);

        // Clean up tokens that FCM says are invalid/unregistered
        if (response.FailureCount > 0)
        {
            var staleTokens = response.Responses
                .Zip(tokens)
                .Where(x => !x.First.IsSuccess && IsInvalidToken(x.First.Exception))
                .Select(x => x.Second)
                .ToList();

            if (staleTokens.Count > 0)
            {
                var rows = await context.DeviceSubscriptions
                    .Where(s => staleTokens.Contains(s.DeviceToken))
                    .ToListAsync(ct);
                context.DeviceSubscriptions.RemoveRange(rows);
                await context.SaveChangesAsync(ct);
            }
        }
    }

    private static bool IsInvalidToken(FirebaseMessagingException? ex) =>
        ex?.MessagingErrorCode is MessagingErrorCode.Unregistered
                               or MessagingErrorCode.InvalidArgument;
}
