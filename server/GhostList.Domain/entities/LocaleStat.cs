namespace GhostList.Domain.Entities;

/// <summary>
/// Append-only daily counters of HTTP requests grouped by the client's
/// <c>Accept-Language</c> header. Used only to estimate which languages and
/// regions the app's users come from, for i18n planning — no IPs, device ids
/// or user ids are stored, just aggregate counts. Rows are never deleted by
/// the cleanup jobs.
/// </summary>
public class LocaleStat
{
    public DateOnly Date { get; set; }

    /// <summary>One of the app's supported language codes ("en", "de", "it", "es") or "other".</summary>
    public string Language { get; set; } = "other";

    /// <summary>
    /// ISO 3166-1 alpha-2 region code derived from the Accept-Language header's
    /// region subtag (e.g. "DE", "CH"), or "" if the header didn't include one.
    /// </summary>
    public string Country { get; set; } = "";

    public int RequestCount { get; set; }
}
