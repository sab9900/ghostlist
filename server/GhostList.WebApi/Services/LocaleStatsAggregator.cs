using System.Collections.Concurrent;

namespace GhostList.WebApi.Services;

/// <summary>
/// In-memory counter of requests by (language, country) derived from the
/// client's <c>Accept-Language</c> header. <see cref="AcceptLanguageTrackingMiddleware"/>
/// records a hit per request; <c>LocaleStatsFlushWorker</c> periodically drains
/// the counts and persists them to <see cref="GhostList.Domain.Entities.LocaleStat"/>.
/// Nothing here is tied to a device, user, or IP — just aggregate counts.
/// </summary>
public interface ILocaleStatsAggregator
{
    void Record(string language, string country);

    /// <summary>Atomically removes and returns all accumulated counts.</summary>
    IReadOnlyCollection<((string Language, string Country) Key, int Count)> Drain();
}

public class LocaleStatsAggregator : ILocaleStatsAggregator
{
    private ConcurrentDictionary<(string Language, string Country), int> _counts = new();

    public void Record(string language, string country) =>
        _counts.AddOrUpdate((language, country), 1, (_, count) => count + 1);

    public IReadOnlyCollection<((string Language, string Country) Key, int Count)> Drain()
    {
        var snapshot = Interlocked.Exchange(ref _counts, new ConcurrentDictionary<(string Language, string Country), int>());
        return snapshot.Select(kvp => (kvp.Key, kvp.Value)).ToList();
    }
}
