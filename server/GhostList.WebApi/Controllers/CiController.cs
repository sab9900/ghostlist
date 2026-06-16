using System.Text.Json;
using GhostList.Application.Features.InfoMessages.Commands.CreateInfoMessage;
using GhostList.Domain.Entities;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

[ApiController]
[Route("api/ci")]
public class CiController(IMediator mediator) : ControllerBase
{
    public record AndroidReleaseRequest(string Version);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

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
            DevicePlatform.Android,
            version));

        return Ok(id);
    }
}
