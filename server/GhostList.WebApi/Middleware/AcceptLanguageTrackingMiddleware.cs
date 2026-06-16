using GhostList.WebApi.Services;

namespace GhostList.WebApi.Middleware;

public class AcceptLanguageTrackingMiddleware(RequestDelegate next, ILocaleStatsAggregator aggregator)
{

    private static readonly HashSet<string> SupportedLanguages = new(StringComparer.OrdinalIgnoreCase) { "en", "de", "it", "es" };

    private const string AdminPathPrefix = "/api/admin";

    public async Task InvokeAsync(HttpContext context)
    {

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

            var region = parts[1].Split('-')[0];
            if (region.Length == 2 && region.All(char.IsLetter))
                country = region.ToUpperInvariant();
        }

        return (language, country);
    }
}
