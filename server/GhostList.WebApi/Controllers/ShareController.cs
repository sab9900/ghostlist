using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;

namespace GhostList.WebApi.Controllers;

public record ShareDeliveryDto(string WrappedKey, string SenderPublicKey, string ListId, string ListName);
public record HandshakeDto(string ReceiverPublicKey);
public record SyncBundleDto(string EncryptedPayload, string Iv, string SenderPublicKey);

[ApiController]
[Route("api/share")]
public class ShareController(IMemoryCache cache) : ControllerBase
{
    private static readonly MemoryCacheEntryOptions CacheOptions = new MemoryCacheEntryOptions()
        .SetAbsoluteExpiration(TimeSpan.FromMinutes(5));

    [HttpPut("{sessionId}")]
    [EnableRateLimiting("share-relay")]
    public IActionResult Deliver(string sessionId, [FromBody] ShareDeliveryDto dto)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return BadRequest();
        cache.Set(sessionId, dto, CacheOptions);
        return NoContent();
    }

    [HttpGet("{sessionId}")]
    public ActionResult<ShareDeliveryDto> Poll(string sessionId)
    {
        if (!cache.TryGetValue<ShareDeliveryDto>(sessionId, out var dto) || dto is null)
            return NotFound();

        cache.Remove(sessionId);
        return Ok(dto);
    }

    [HttpPut("{sessionId}/handshake")]
    [EnableRateLimiting("share-relay")]
    public IActionResult PostHandshake(string sessionId, [FromBody] HandshakeDto dto)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return BadRequest();
        cache.Set($"hs:{sessionId}", dto, CacheOptions);
        return NoContent();
    }

    [HttpGet("{sessionId}/handshake")]
    public ActionResult<HandshakeDto> PollHandshake(string sessionId)
    {
        if (!cache.TryGetValue<HandshakeDto>($"hs:{sessionId}", out var dto) || dto is null)
            return NotFound();

        cache.Remove($"hs:{sessionId}");
        return Ok(dto);
    }

    [HttpPut("{sessionId}/sync-bundle")]
    [EnableRateLimiting("share-relay")]
    public IActionResult PutSyncBundle(string sessionId, [FromBody] SyncBundleDto dto)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return BadRequest();
        cache.Set($"sync:{sessionId}", dto, CacheOptions);
        return NoContent();
    }

    [HttpGet("{sessionId}/sync-bundle")]
    public ActionResult<SyncBundleDto> GetSyncBundle(string sessionId)
    {
        if (!cache.TryGetValue<SyncBundleDto>($"sync:{sessionId}", out var dto) || dto is null)
            return NotFound();

        cache.Remove($"sync:{sessionId}");
        return Ok(dto);
    }

    [HttpPut("{sessionId}/sync-bundle-reply")]
    [EnableRateLimiting("share-relay")]
    public IActionResult PutSyncBundleReply(string sessionId, [FromBody] SyncBundleDto dto)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return BadRequest();
        cache.Set($"syncr:{sessionId}", dto, CacheOptions);
        return NoContent();
    }

    [HttpGet("{sessionId}/sync-bundle-reply")]
    public ActionResult<SyncBundleDto> GetSyncBundleReply(string sessionId)
    {
        if (!cache.TryGetValue<SyncBundleDto>($"syncr:{sessionId}", out var dto) || dto is null)
            return NotFound();

        cache.Remove($"syncr:{sessionId}");
        return Ok(dto);
    }
}
