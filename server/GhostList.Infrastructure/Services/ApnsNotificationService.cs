using dotAPNS;
using GhostList.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace GhostList.Infrastructure.Services;

public class ApnsOptions
{
    public string? KeyId { get; set; }
    public string? TeamId { get; set; }
    public string? BundleId { get; set; }
    /// <summary>Contents of the .p8 file (with or without the BEGIN/END lines).</summary>
    public string? PrivateKeyPem { get; set; }
}

public class ApnsNotificationService(
    IApplicationDbContext context,
    IOptions<ApnsOptions> opts,
    IHttpClientFactory httpClientFactory) : IPushNotificationService
{
    public Task SendItemNotificationAsync(Guid listId, string? senderToken, CancellationToken ct) =>
        SendAsync(listId, senderToken, body: "New item added to your list", type: "item", ct);

    public Task SendMessageNotificationAsync(Guid listId, string? senderToken, CancellationToken ct) =>
        SendAsync(listId, senderToken, body: "New message in your list", type: "message", ct);

    private async Task SendAsync(Guid listId, string? senderToken, string body, string type, CancellationToken ct)
    {
        var o = opts.Value;
        if (string.IsNullOrWhiteSpace(o.KeyId) ||
            string.IsNullOrWhiteSpace(o.TeamId) ||
            string.IsNullOrWhiteSpace(o.BundleId) ||
            string.IsNullOrWhiteSpace(o.PrivateKeyPem))
            return;

        var tokens = await context.DeviceSubscriptions
            .Where(s => s.ListId == listId &&
                        (senderToken == null || s.DeviceToken != senderToken))
            .Select(s => s.DeviceToken)
            .Distinct()
            .ToListAsync(ct);

        if (tokens.Count == 0) return;

        var jwtOptions = new ApnsJwtOptions
        {
            KeyId = o.KeyId,
            TeamId = o.TeamId,
            BundleId = o.BundleId,
            CertContent = o.PrivateKeyPem,
        };

        var httpClient = httpClientFactory.CreateClient("apns");
        var client = ApnsClient.CreateUsingJwt(httpClient, jwtOptions);

        var staleTokens = new List<string>();

        foreach (var token in tokens)
        {
            var push = new ApplePush(ApplePushType.Alert)
                .AddToken(token)
                .AddAlert("GhostList", body)
                .AddSound()
                .AddCustomProperty("listId", listId.ToString())
                .AddCustomProperty("type", type);

            ApnsResponse response;
            try { response = await client.Send(push); }
            catch { continue; }

            if (!response.IsSuccessful && IsStaleToken(response.Reason))
                staleTokens.Add(token);
        }

        if (staleTokens.Count > 0)
        {
            var rows = await context.DeviceSubscriptions
                .Where(s => staleTokens.Contains(s.DeviceToken))
                .ToListAsync(ct);
            context.DeviceSubscriptions.RemoveRange(rows);
            await context.SaveChangesAsync(ct);
        }
    }

    private static bool IsStaleToken(ApnsResponseReason reason) =>
        reason is ApnsResponseReason.BadDeviceToken
               or ApnsResponseReason.Unregistered
               or ApnsResponseReason.DeviceTokenNotForTopic;
}
