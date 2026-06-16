using System.Collections.Concurrent;

namespace GhostList.WebApi.Services;

public interface ILocaleStatsAggregator
{
    void Record(string language, string country);

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
