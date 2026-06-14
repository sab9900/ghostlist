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

    /// <summary>Public web app origin, used to build absolute deep links for web push (FcmOptions.Link).</summary>
    private const string WebAppBaseUrl = "https://app.ghost-list.com";

    private static readonly object InitLock = new();
    private static FirebaseApp? _app;

    /// <summary>Maps a notification type to the list-detail tab it should deep-link to. Keep in sync with
    /// the client's PushNotificationService.routeForType.</summary>
    private static string WebTabForType(PushNotificationType type) => type switch
    {
        PushNotificationType.Message => "chat",
        PushNotificationType.WhisperInvite => "whisper",
        _ => "items",
    };

    /// <summary>Locale used when a subscription has no recorded locale, or its locale isn't supported.
    /// Matches LanguageService's fallback on the client.</summary>
    private const string FallbackLocale = "en_US";

    /// <summary>
    /// Push notification title/body per locale and notification type. Keep the set of locales in
    /// sync with LanguageService.SUPPORTED on the client (en_US, de_DE, it_IT, es_ES).
    /// </summary>
    private static readonly Dictionary<string, Dictionary<PushNotificationType, (string Title, string Body)>> Texts = new()
    {
        ["en_US"] = new()
        {
            [PushNotificationType.Message] = ("GhostList", "New message in one of your lists"),
            [PushNotificationType.ItemsChanged] = ("GhostList", "One of your lists was updated"),
            [PushNotificationType.WhisperInvite] = ("GhostList", "👻 Someone is inviting you to whisper in Lethe"),
        },
        ["de_DE"] = new()
        {
            [PushNotificationType.Message] = ("GhostList", "Neue Nachricht in einer deiner Listen"),
            [PushNotificationType.ItemsChanged] = ("GhostList", "Eine deiner Listen wurde aktualisiert"),
            [PushNotificationType.WhisperInvite] = ("GhostList", "👻 Jemand lädt dich ein, in Lethe zu flüstern"),
        },
        ["it_IT"] = new()
        {
            [PushNotificationType.Message] = ("GhostList", "Nuovo messaggio in una delle tue liste"),
            [PushNotificationType.ItemsChanged] = ("GhostList", "Una delle tue liste è stata aggiornata"),
            [PushNotificationType.WhisperInvite] = ("GhostList", "👻 Qualcuno ti invita a sussurrare in Lethe"),
        },
        ["es_ES"] = new()
        {
            [PushNotificationType.Message] = ("GhostList", "Nuevo mensaje en una de tus listas"),
            [PushNotificationType.ItemsChanged] = ("GhostList", "Se ha actualizado una de tus listas"),
            [PushNotificationType.WhisperInvite] = ("GhostList", "👻 Alguien te invita a susurrar en Lethe"),
        },
    };

    /// <summary>Generic fallback text for notification types not covered by <see cref="Texts"/> (i.e. the
    /// default "Update" case), per locale.</summary>
    private static readonly Dictionary<string, string> DefaultBody = new()
    {
        ["en_US"] = "Update",
        ["de_DE"] = "Update",
        ["it_IT"] = "Aggiornamento",
        ["es_ES"] = "Actualización",
    };

    /// <summary>Picks the notification title/body for the given type in the subscription's locale,
    /// falling back to <see cref="FallbackLocale"/> if the locale is missing or unsupported.</summary>
    private static (string Title, string Body) GetText(string? locale, PushNotificationType type)
    {
        var key = locale is not null && Texts.ContainsKey(locale) ? locale : FallbackLocale;
        var byType = Texts[key];

        return byType.TryGetValue(type, out var text)
            ? text
            : ("GhostList", DefaultBody.GetValueOrDefault(key, DefaultBody[FallbackLocale]));
    }

    public async Task SendNotificationAsync(Guid listId, PushNotificationType type, string? senderDeviceId, CancellationToken ct, IReadOnlyCollection<string>? targetDeviceIds = null)
    {
        var app = GetOrCreateApp();
        if (app is null) return;

        using var scope = scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
        ct = CancellationToken.None;

        IQueryable<DeviceSubscription> query = context.DeviceSubscriptions
            .Where(s => s.ListId == listId);

        if (!string.IsNullOrEmpty(senderDeviceId))
            query = query.Where(s => s.DeviceId != senderDeviceId);

        if (type == PushNotificationType.WhisperInvite)
        {
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

        var messaging = FirebaseMessaging.GetMessaging(app);
        var staleTokens = new List<string>();

        foreach (var batch in targets.Chunk(500))
        {
            var messages = batch.Select(s => BuildMessage(s, listId, type)).ToList();

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

    private static Message BuildMessage(DeviceSubscription sub, Guid listId, PushNotificationType type)
    {
        var (title, body) = GetText(sub.Locale, type);

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
                        Link = $"{WebAppBaseUrl}/list/{listId}/{WebTabForType(type)}",
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
