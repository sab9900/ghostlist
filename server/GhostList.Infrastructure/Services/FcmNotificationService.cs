using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace GhostList.Infrastructure.Services;

public class FcmOptions
{
    /// <summary>Raw JSON contents of the Firebase service-account key file.</summary>
    public string? CredentialsJson { get; set; }

    /// <summary>Path to a file containing the service-account JSON (alternative to <see cref="CredentialsJson"/>).</summary>
    public string? CredentialsPath { get; set; }
}

public class FcmNotificationService(
    IServiceScopeFactory scopeFactory,
    IPresenceTracker presence,
    IWhisperPresenceTracker whisperPresence,
    IOptions<FcmOptions> opts,
    ILogger<FcmNotificationService> logger) : IPushNotificationService
{
    private const string AppName = "GhostList";
    private static readonly object InitLock = new();
    private static FirebaseApp? _app;

    public async Task SendNotificationAsync(Guid listId, PushNotificationType type, string? senderDeviceId, CancellationToken ct, IReadOnlyCollection<string>? targetDeviceIds = null)
    {
        var app = GetOrCreateApp();
        if (app is null) return;

        // This runs fire-and-forget alongside the request that triggered it, so it
        // must NOT share the request-scoped DbContext (EF Core's DbContext is not
        // safe for concurrent use). Create an independent scope/context, and don't
        // tie the work to the request's CancellationToken since the request may
        // complete (and cancel its token) before this finishes.
        using var scope = scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
        ct = CancellationToken.None;

        IQueryable<DeviceSubscription> query = context.DeviceSubscriptions
            .Where(s => s.ListId == listId);

        if (!string.IsNullOrEmpty(senderDeviceId))
            query = query.Where(s => s.DeviceId != senderDeviceId);

        if (type == PushNotificationType.WhisperInvite)
        {
            // Whisper invites are an explicit, one-off action — they always
            // reach their recipients regardless of the per-list notification
            // preferences. If specific recipients were requested, narrow to
            // those; otherwise every other list member is a candidate.
            if (targetDeviceIds is { Count: > 0 })
                query = query.Where(s => targetDeviceIds.Contains(s.DeviceId));
        }
        else
        {
            query = type == PushNotificationType.Message
                ? query.Where(s => s.NotifyOnMessage)
                : query.Where(s => s.NotifyOnItemsChanged);
        }

        var subscriptions = await query.ToListAsync(ct);
        logger.LogInformation(
            "Push {Type} for list {ListId}: {Count} subscription(s) match (sender={SenderDeviceId})",
            type, listId, subscriptions.Count, senderDeviceId);
        if (subscriptions.Count == 0) return;

        var alreadyWatching = type == PushNotificationType.WhisperInvite
            ? whisperPresence.GetRoster(listId.ToString()).Select(e => e.DeviceId).ToHashSet()
            : [];

        var targets = subscriptions
            .Where(s => !presence.ShouldSuppress(listId.ToString(), s.DeviceId))
            .Where(s => !alreadyWatching.Contains(s.DeviceId))
            .ToList();

        logger.LogInformation(
            "Push {Type} for list {ListId}: {TargetCount}/{SubCount} target(s) after presence suppression",
            type, listId, targets.Count, subscriptions.Count);
        if (targets.Count == 0) return;

        var (title, body) = type switch
        {
            PushNotificationType.Message => ("GhostList", "Neue Nachricht in einer deiner Listen"),
            PushNotificationType.ItemsChanged => ("GhostList", "Eine deiner Listen wurde aktualisiert"),
            PushNotificationType.WhisperInvite => ("GhostList", "👀 Jemand schaut sich gerade eine deiner Listen an"),
            _ => ("GhostList", "Update"),
        };

        var messaging = FirebaseMessaging.GetMessaging(app);
        var staleTokens = new List<string>();

        // SendEachAsync accepts at most 500 messages per call.
        foreach (var batch in targets.Chunk(500))
        {
            var messages = batch.Select(s => BuildMessage(s, listId, type, title, body)).ToList();

            BatchResponse response;
            try
            {
                response = await messaging.SendEachAsync(messages, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to send FCM batch for list {ListId}", listId);
                continue;
            }

            for (var i = 0; i < response.Responses.Count; i++)
            {
                var result = response.Responses[i];
                if (result.IsSuccess)
                {
                    logger.LogInformation(
                        "FCM send succeeded for device {DeviceId} (platform={Platform}), messageId={MessageId}",
                        batch[i].DeviceId, batch[i].Platform, result.MessageId);
                    continue;
                }

                if (IsStaleToken(result.Exception))
                {
                    staleTokens.Add(batch[i].DeviceToken);
                    logger.LogWarning(
                        "FCM send failed for device {DeviceId} (platform={Platform}): stale token, removing. {Error}",
                        batch[i].DeviceId, batch[i].Platform, result.Exception?.Message);
                }
                else
                    logger.LogWarning(
                        "FCM send failed for device {DeviceId} (platform={Platform}): {Error}",
                        batch[i].DeviceId, batch[i].Platform, result.Exception?.Message);
            }
        }

        if (staleTokens.Count > 0)
        {
            var stale = await context.DeviceSubscriptions
                .Where(s => staleTokens.Contains(s.DeviceToken))
                .ToListAsync(ct);

            if (stale.Count > 0)
            {
                context.DeviceSubscriptions.RemoveRange(stale);
                await context.SaveChangesAsync(ct);
            }
        }
    }

    private static Message BuildMessage(DeviceSubscription sub, Guid listId, PushNotificationType type, string title, string body)
    {
        var data = new Dictionary<string, string>
        {
            ["listId"] = listId.ToString(),
            ["type"] = type switch
            {
                PushNotificationType.Message => "message",
                PushNotificationType.ItemsChanged => "items_changed",
                PushNotificationType.WhisperInvite => "whisper_invite",
                _ => "update",
            },
        };

        var message = new Message
        {
            Token = sub.DeviceToken,
            Data = data,
        };

        switch (sub.Platform)
        {
            case DevicePlatform.Ios:
                message.Notification = new Notification { Title = title, Body = body };
                message.Apns = new ApnsConfig
                {
                    Aps = new Aps
                    {
                        Sound = "default",
                        ContentAvailable = true,
                    },
                };
                break;

            case DevicePlatform.Android:
                message.Notification = new Notification { Title = title, Body = body };
                message.Android = new AndroidConfig
                {
                    Priority = Priority.High,
                    Notification = new AndroidNotification
                    {
                        Sound = "default",
                    },
                };
                break;

            case DevicePlatform.Web:
                message.Webpush = new WebpushConfig
                {
                    Notification = new WebpushNotification
                    {
                        Title = title,
                        Body = body,
                        Icon = "/icons/icon-192.png",
                    },
                    FcmOptions = new WebpushFcmOptions
                    {
                        Link = "/",
                    },
                };
                break;
        }

        return message;
    }

    private static bool IsStaleToken(FirebaseMessagingException? ex) =>
        ex is not null && ex.MessagingErrorCode is
            MessagingErrorCode.Unregistered or
            MessagingErrorCode.InvalidArgument or
            MessagingErrorCode.SenderIdMismatch;

    private FirebaseApp? GetOrCreateApp()
    {
        if (_app is not null) return _app;

        lock (InitLock)
        {
            if (_app is not null) return _app;

            var existing = FirebaseApp.GetInstance(AppName);
            if (existing is not null)
            {
                _app = existing;
                return _app;
            }

            var credential = LoadCredential();
            if (credential is null)
            {
                logger.LogWarning("FCM not configured: set Fcm__CredentialsJson or Fcm__CredentialsPath.");
                return null;
            }

            _app = FirebaseApp.Create(new AppOptions { Credential = credential }, AppName);
            return _app;
        }
    }

    private GoogleCredential? LoadCredential()
    {
        var o = opts.Value;

        try
        {
            if (!string.IsNullOrWhiteSpace(o.CredentialsPath) && File.Exists(o.CredentialsPath))
                return GoogleCredential.FromFile(o.CredentialsPath);

            if (!string.IsNullOrWhiteSpace(o.CredentialsJson))
                return GoogleCredential.FromJson(o.CredentialsJson);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to load Firebase credentials.");
        }

        return null;
    }
}
