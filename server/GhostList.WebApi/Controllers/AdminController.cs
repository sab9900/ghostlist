using GhostList.Application.Features.Admin.Queries.GetAdminStats;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminController(IMediator mediator) : ControllerBase
{

    [HttpGet("stats")]
    public async Task<ActionResult<AdminStatsDto>> GetStats([FromQuery] int days = 30)
    {
        var result = await mediator.Send(new GetAdminStatsQuery(days));
        return Ok(result);
    }
}
