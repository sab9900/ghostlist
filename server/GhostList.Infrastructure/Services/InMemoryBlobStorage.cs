using System.Collections.Concurrent;
using GhostList.Application.Common.Interfaces;

namespace GhostList.Infrastructure.Services;

public class InMemoryBlobStorage : IBlobStorage
{
    private readonly ConcurrentDictionary<string, (string Content, DateTime StoredAt)> _store = new();

    public Task SaveAsync(string key, string content, CancellationToken cancellationToken = default)
    {
        _store[key] = (content, DateTime.UtcNow);
        return Task.CompletedTask;
    }

    public Task<string> GetAsync(string key, CancellationToken cancellationToken = default)
    {
        if (_store.TryGetValue(key, out var entry))
            return Task.FromResult(entry.Content);

        throw new KeyNotFoundException($"Blob not found: {key}");
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        _store.TryRemove(key, out _);
        return Task.CompletedTask;
    }

    public Task DeleteManyAsync(IEnumerable<string> keys, CancellationToken cancellationToken = default)
    {
        foreach (var key in keys)
            _store.TryRemove(key, out _);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<string>> ListKeysOlderThanAsync(string prefix, TimeSpan maxAge, CancellationToken cancellationToken = default)
    {
        var cutoff = DateTime.UtcNow - maxAge;
        var keys = _store
            .Where(kv => kv.Key.StartsWith(prefix) && kv.Value.StoredAt <= cutoff)
            .Select(kv => kv.Key)
            .ToList();
        return Task.FromResult<IReadOnlyList<string>>(keys);
    }
}
