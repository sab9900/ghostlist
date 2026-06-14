using System.Text.Json;
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

    /// <summary>JSON options used when serializing the per-language title/body maps below.</summary>
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Called by the Android release workflow after a new APK has been deployed.
    /// Posts an Android-only "release notes" broadcast so users see that an update
    /// is available. Title/body are serialized as JSON objects mapping language code
    /// to text (see the client's <c>LanguageService</c> / <c>resolveLocalizedText</c>),
    /// which falls back to <c>en_US</c> for unknown languages.
    /// </summary>
    [HttpPost("android-release")]
    public async Task<ActionResult<Guid>> AndroidRelease([FromBody] AndroidReleaseRequest request)
    {
        var version = request.Version.Trim();

        var title = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["en_US"] = "Android app updated",
            ["de_DE"] = "Android-App aktualisiert",
            ["it_IT"] = "App Android aggiornata",
            ["es_ES"] = "App de Android actualizada",
        }, JsonOptions);

        var body = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["en_US"] = $"Version {version} of the GhostList app is now available for download.",
            ["de_DE"] = $"Version {version} der GhostList-App steht zum Download bereit.",
            ["it_IT"] = $"La versione {version} dell'app GhostList è disponibile per il download.",
            ["es_ES"] = $"La versión {version} de la app GhostList está disponible para descargar.",
        }, JsonOptions);

        var id = await mediator.Send(new CreateInfoMessageCommand(
            InfoMessageType.ReleaseNotes,
            title,
            body,
            DevicePlatform.Android));

        return Ok(id);
    }
}
