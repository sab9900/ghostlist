using System.Reflection;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

public record VersionDto(string Version);

[ApiController]
[Route("api/version")]
public class VersionController : ControllerBase
{

    private static readonly string Version =
        (Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0")
        .Split('+')[0];

    [HttpGet]
    public ActionResult<VersionDto> Get() => Ok(new VersionDto(Version));
}
