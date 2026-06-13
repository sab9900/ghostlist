using GhostList.Application.Features.Admin.Queries.GetAdminStats;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

/// <summary>
/// Read-only usage statistics for the admin dashboard.
/// Protected by <see cref="GhostList.WebApi.Middleware.AdminAuthMiddleware"/>.
/// </summary>
[ApiController]
[Route("api/admin")]
public class AdminController(IMediator mediator) : ControllerBase
{
    /// <param name="days">How many days of daily history to include (1-365, default 30).</param>
    [HttpGet("stats")]
    public async Task<ActionResult<AdminStatsDto>> GetStats([FromQuery] int days = 30)
    {
        var result = await mediator.Send(new GetAdminStatsQuery(days));
        return Ok(result);
    }
}
