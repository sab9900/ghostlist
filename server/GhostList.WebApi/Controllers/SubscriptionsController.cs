using GhostList.Application.Common.Interfaces;
using GhostList.Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GhostList.WebApi.Controllers;

public record SubscribeRequest(
    string DeviceToken,
    DevicePlatform Platform,
    bool NotifyOnMessage = true,
    bool NotifyOnItemsChanged = false,
    string? Locale = null);

[ApiController]
[Route("api/[controller]")]
public class SubscriptionsController(IApplicationDbContext context) : ControllerBase
{
    /// <summary>Locales supported for push notification text (LanguageService.SUPPORTED on the client),
    /// keyed by the primary language tag from an Accept-Language header (e.g. "de" → "de_DE").</summary>
    private static readonly Dictionary<string, string> SupportedLocalesByLanguage = new(StringComparer.OrdinalIgnoreCase)
    {
        ["en"] = "en_US",
        ["de"] = "de_DE",
        ["it"] = "it_IT",
        ["es"] = "es_ES",
    };

    /// <summary>
    /// Picks the locale to store for this subscription: the client-provided <paramref name="requestLocale"/>
    /// if present, otherwise the best match from the request's Accept-Language header, otherwise null
    /// (FcmNotificationService falls back to en_US for null locales).
    /// </summary>
    private static string? ResolveLocale(string? requestLocale, string? acceptLanguageHeader)
    {
        if (!string.IsNullOrWhiteSpace(requestLocale))
            return requestLocale;

        if (string.IsNullOrWhiteSpace(acceptLanguageHeader))
            return null;

        var ranges = acceptLanguageHeader
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(ParseLanguageRange)
            .Where(r => r is not null)
            .Select(r => r!.Value)
            .OrderByDescending(r => r.Quality);

        foreach (var (language, _) in ranges)
        {
            if (SupportedLocalesByLanguage.TryGetValue(language, out var locale))
                return locale;
        }

        return null;
    }

    private static (string Language, double Quality)? ParseLanguageRange(string range)
    {
        var parts = range.Split(';', StringSplitOptions.TrimEntries);
        var language = parts[0].Split('-')[0];
        if (string.IsNullOrWhiteSpace(language)) return null;

        var quality = 1.0;
        if (parts.Length > 1
            && parts[1].StartsWith("q=", StringComparison.OrdinalIgnoreCase)
            && double.TryParse(parts[1].AsSpan(2), System.Globalization.CultureInfo.InvariantCulture, out var q))
        {
            quality = q;
        }

        return (language, quality);
    }

    /// <summary>
    /// Register (or update) this device's push subscription for a list —
    /// including its push token, platform, and per-list notification
    /// preferences. Called whenever the token changes or the user updates
    /// their notification settings.
    /// </summary>
    [HttpPut("{listId:guid}")]
    public async Task<ActionResult> Subscribe(Guid listId, [FromBody] SubscribeRequest request, CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceId))
            return BadRequest("X-Device-Id header is required.");

        if (string.IsNullOrWhiteSpace(request.DeviceToken))
            return BadRequest("DeviceToken is required.");

        var locale = ResolveLocale(request.Locale, Request.Headers["Accept-Language"].FirstOrDefault());

        var sub = await context.DeviceSubscriptions
            .FirstOrDefaultAsync(s => s.ListId == listId && s.DeviceId == deviceId, ct);

        if (sub is null)
        {
            context.DeviceSubscriptions.Add(DeviceSubscription.Create(
                deviceId,
                listId,
                request.DeviceToken,
                request.Platform,
                request.NotifyOnMessage,
                request.NotifyOnItemsChanged,
                locale));
        }
        else
        {
            sub.UpdateToken(request.DeviceToken, request.Platform, locale);
            sub.UpdatePreferences(request.NotifyOnMessage, request.NotifyOnItemsChanged);
        }

        await context.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Unregister this device from push notifications for a list.</summary>
    [HttpDelete("{listId:guid}")]
    public async Task<ActionResult> Unsubscribe(Guid listId, CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceId))
            return BadRequest("X-Device-Id header is required.");

        var sub = await context.DeviceSubscriptions
            .FirstOrDefaultAsync(s => s.ListId == listId && s.DeviceId == deviceId, ct);

        if (sub is not null)
        {
            context.DeviceSubscriptions.Remove(sub);
            await context.SaveChangesAsync(ct);
        }

        return NoContent();
    }
}
