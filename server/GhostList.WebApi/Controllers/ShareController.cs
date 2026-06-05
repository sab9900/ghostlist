using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace GhostList.WebApi.Controllers;

public record ShareDeliveryDto(string WrappedKey, string SenderPublicKey, string ListId);

[ApiController]
[Route("api/share")]
public class ShareController(IMemoryCache cache) : ControllerBase
{
    private static readonly MemoryCacheEntryOptions CacheOptions = new MemoryCacheEntryOptions()
        .SetAbsoluteExpiration(TimeSpan.FromMinutes(5));

    [HttpPut("{sessionId}")]
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
}
