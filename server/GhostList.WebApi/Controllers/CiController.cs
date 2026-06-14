using GhostList.Application.Features.InfoMessages.Commands.CreateInfoMessage;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

/// <summary>
/// Narrow endpoints for the CI pipeline to call. Protected by
/// <see cref="GhostList.WebApi.Middleware.CiAuthMiddleware"/> (shared-secret header,
/// independent from the admin login) so the GitHub Actions runner only ever gets
/// access to these specific, low-risk actions.
/// </summary>
[ApiController]
[Route("api/ci")]
public class CiController(IMediator mediator) : ControllerBase
{
    public record AndroidReleaseRequest(string Version);

    /// <summary>
    /// Called by the Android release workflow after a new APK has been deployed.
    /// Posts an Android-only "release notes" broadcast so users see that an update
    /// is available.
    /// </summary>
    [HttpPost("android-release")]
    public async Task<ActionResult<Guid>> AndroidRelease([FromBody] AndroidReleaseRequest request)
    {
        var version = request.Version.Trim();

        var id = await mediator.Send(new CreateInfoMessageCommand(
            InfoMessageType.ReleaseNotes,
            "Android-App aktualisiert",
            $"Version {version} der GhostList-App steht zum Download bereit.",
            DevicePlatform.Android));

        return Ok(id);
    }
}
