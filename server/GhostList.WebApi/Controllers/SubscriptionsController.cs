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
    bool NotifyOnLethe = true,
    bool NotifyOnCharon = true,
    bool NotifyOnNemesis = true,
    string? Locale = null);

[ApiController]
[Route("api/[controller]")]
public class SubscriptionsController(IApplicationDbContext context) : ControllerBase
{

    private static readonly Dictionary<string, string> SupportedLocalesByLanguage = new(StringComparer.OrdinalIgnoreCase)
    {
        ["en"] = "en_US",
        ["de"] = "de_DE",
        ["it"] = "it_IT",
        ["es"] = "es_ES",
    };

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

    [HttpPut("{listId:guid}")]
    public async Task<ActionResult> Subscribe(Guid listId, [FromBody] SubscribeRequest request, CancellationToken ct)
    {
        var deviceId = Request.Headers["X-Device-Id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(deviceId))
            return BadRequest("X-Device-Id header is required.");

        if (string.IsNullOrWhiteSpace(request.DeviceToken))
            return BadRequest("DeviceToken is required.");

        var userId = Request.Headers["X-User-Id"].FirstOrDefault();
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
                request.NotifyOnLethe,
                request.NotifyOnCharon,
                request.NotifyOnNemesis,
                locale,
                userId));
        }
        else
        {
            sub.UpdateToken(request.DeviceToken, request.Platform, locale);
            sub.UpdatePreferences(request.NotifyOnMessage, request.NotifyOnItemsChanged, request.NotifyOnLethe, request.NotifyOnCharon, request.NotifyOnNemesis);
            if (!string.IsNullOrWhiteSpace(userId))
                sub.UpdateUserId(userId);
        }

        await context.SaveChangesAsync(ct);
        return NoContent();
    }

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
