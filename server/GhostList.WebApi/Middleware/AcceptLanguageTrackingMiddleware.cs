using GhostList.WebApi.Services;

namespace GhostList.WebApi.Middleware;

/// <summary>
/// For every incoming request, takes the client's <c>Accept-Language</c> header
/// and bumps an in-memory counter keyed by (app language, country region) via
/// <see cref="ILocaleStatsAggregator"/>. This is the only "where are our users"
/// signal the zero-knowledge server has — no IPs, cookies, or device/user ids
/// are read or stored, just an aggregate count of which languages/regions
/// browsers report. Used purely to inform i18n priorities.
/// </summary>
public class AcceptLanguageTrackingMiddleware(RequestDelegate next, ILocaleStatsAggregator aggregator)
{
    /// <summary>The app's currently supported UI languages (see client LanguageService.SUPPORTED).</summary>
    private static readonly HashSet<string> SupportedLanguages = new(StringComparer.OrdinalIgnoreCase) { "en", "de", "it", "es" };

    private const string AdminPathPrefix = "/api/admin";

    public async Task InvokeAsync(HttpContext context)
    {
        // Skip the admin dashboard's own traffic so it doesn't skew the numbers
        // towards whoever happens to be looking at the dashboard.
        if (!context.Request.Path.StartsWithSegments(AdminPathPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var header = context.Request.Headers.AcceptLanguage.ToString();
            if (!string.IsNullOrWhiteSpace(header))
            {
                var (language, country) = Parse(header);
                aggregator.Record(language, country);
            }
        }

        await next(context);
    }

    /// <summary>
    /// Extracts a normalized (language, country) pair from a raw Accept-Language
    /// header value, using only the highest-priority entry, e.g.:
    /// "de-CH,de;q=0.9,en;q=0.8" -&gt; ("de", "CH")
    /// "fr-FR,fr;q=0.9"          -&gt; ("other", "FR")
    /// "en"                      -&gt; ("en", "")
    /// </summary>
    internal static (string Language, string Country) Parse(string headerValue)
    {
        var primary = headerValue.Split(',')[0].Split(';')[0].Trim();
        if (primary.Length == 0) return ("other", "");

        var parts = primary.Split(['-', '_'], 2);
        var languageTag = parts[0];
        var language = languageTag.Length == 2 && languageTag.All(char.IsLetter)
            ? languageTag.ToLowerInvariant()
            : "other";

        if (!SupportedLanguages.Contains(language)) language = "other";

        var country = "";
        if (parts.Length > 1)
        {
            // Region subtags can be a 2-letter country code (e.g. "DE") or a
            // 3-digit UN M49 area code (e.g. "419" for Latin America), or a
            // script subtag (e.g. "Hans" in "zh-Hans-CN"). We only care about
            // plain 2-letter country codes.
            var region = parts[1].Split('-')[0];
            if (region.Length == 2 && region.All(char.IsLetter))
                country = region.ToUpperInvariant();
        }

        return (language, country);
    }
}
