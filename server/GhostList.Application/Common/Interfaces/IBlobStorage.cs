namespace GhostList.Application.Common.Interfaces;

public interface IBlobStorage
{
    Task SaveAsync(string key, string content, CancellationToken cancellationToken = default);
    Task<string> GetAsync(string key, CancellationToken cancellationToken = default);
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);
    Task DeleteManyAsync(IEnumerable<string> keys, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> ListKeysOlderThanAsync(string prefix, TimeSpan maxAge, CancellationToken cancellationToken = default);
}
