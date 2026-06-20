using System.Text;
using GhostList.Application.Common.Interfaces;
using Microsoft.Extensions.Options;
using Minio;
using Minio.DataModel.Args;

namespace GhostList.Infrastructure.Services;

public class MinIOOptions
{
    public string Endpoint { get; set; } = null!;
    public string AccessKey { get; set; } = null!;
    public string SecretKey { get; set; } = null!;
    public string BucketName { get; set; } = null!;
}

public class MinIOBlobStorage(IOptions<MinIOOptions> options) : IBlobStorage
{
    private readonly IMinioClient _client = new MinioClient()
        .WithEndpoint(options.Value.Endpoint)
        .WithCredentials(options.Value.AccessKey, options.Value.SecretKey)
        .Build();

    private readonly string _bucket = options.Value.BucketName;

    public async Task SaveAsync(string key, string content, CancellationToken cancellationToken = default)
    {
        await EnsureBucketExistsAsync(cancellationToken);

        var bytes = Encoding.UTF8.GetBytes(content);
        using var stream = new MemoryStream(bytes);

        await _client.PutObjectAsync(new PutObjectArgs()
            .WithBucket(_bucket)
            .WithObject(key)
            .WithStreamData(stream)
            .WithObjectSize(bytes.Length)
            .WithContentType("text/plain"),
            cancellationToken);
    }

    public async Task<string> GetAsync(string key, CancellationToken cancellationToken = default)
    {
        using var result = new MemoryStream();

        await _client.GetObjectAsync(new GetObjectArgs()
            .WithBucket(_bucket)
            .WithObject(key)
            .WithCallbackStream(stream => stream.CopyTo(result)),
            cancellationToken);

        return Encoding.UTF8.GetString(result.ToArray());
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        await _client.RemoveObjectAsync(new RemoveObjectArgs()
            .WithBucket(_bucket)
            .WithObject(key),
            cancellationToken);
    }

    public async Task DeleteManyAsync(IEnumerable<string> keys, CancellationToken cancellationToken = default)
    {
        var keyList = keys.ToList();
        if (keyList.Count == 0) return;

        await _client.RemoveObjectsAsync(new RemoveObjectsArgs()
            .WithBucket(_bucket)
            .WithObjects(keyList),
            cancellationToken);
    }

    public async Task<IReadOnlyList<string>> ListKeysOlderThanAsync(string prefix, TimeSpan maxAge, CancellationToken cancellationToken = default)
    {
        var cutoff = DateTime.UtcNow - maxAge;
        var keys = new List<string>();

        var listArgs = new ListObjectsArgs()
            .WithBucket(_bucket)
            .WithPrefix(prefix)
            .WithRecursive(true);

        await foreach (var item in _client.ListObjectsEnumAsync(listArgs, cancellationToken))
        {
            if (item.LastModifiedDateTime.HasValue && item.LastModifiedDateTime.Value.ToUniversalTime() <= cutoff)
                keys.Add(item.Key);
        }

        return keys;
    }

    private async Task EnsureBucketExistsAsync(CancellationToken cancellationToken)
    {
        var exists = await _client.BucketExistsAsync(new BucketExistsArgs().WithBucket(_bucket), cancellationToken);
        if (!exists)
            await _client.MakeBucketAsync(new MakeBucketArgs().WithBucket(_bucket), cancellationToken);
    }
}
