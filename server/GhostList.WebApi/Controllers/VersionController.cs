using System.Reflection;
using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

public record VersionDto(string Version);

/// <summary>
/// Public endpoint exposing the running backend version, shown in the client's About screen.
/// </summary>
[ApiController]
[Route("api/version")]
public class VersionController : ControllerBase
{
    // The SDK appends "+<git-sha>" (SourceRevisionId) to InformationalVersion; strip it for a clean semver.
    private static readonly string Version =
        (Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0")
        .Split('+')[0];

    [HttpGet]
    public ActionResult<VersionDto> Get() => Ok(new VersionDto(Version));
}
