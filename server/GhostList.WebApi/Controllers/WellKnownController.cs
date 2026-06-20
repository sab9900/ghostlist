using Microsoft.AspNetCore.Mvc;

namespace GhostList.WebApi.Controllers;

[ApiController]
public class WellKnownController : ControllerBase
{
    private const string AppleAppSiteAssociationJson = """
        {
            "applinks": {
                "details": [
                    {
                        "appIDs": ["U683G47B23.com.norica-informatics.ghostlist"],
                        "components": [
                            { "/": "/join/*" }
                        ]
                    }
                ]
            }
        }
        """;

    private const string AssetLinksJson = """
        [
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": "com.norica_informatics.ghostlist",
                    "sha256_cert_fingerprints": ["BE:2D:07:1E:12:DF:6E:25:F0:33:44:4F:DE:CA:24:F5:D4:EF:F2:A8:51:55:3A:1C:8A:D0:14:A4:5A:D7:BA:03"]
                }
            }
        ]
        """;

    [HttpGet("/.well-known/apple-app-site-association")]
    public ContentResult AppleAppSiteAssociation() =>
        Content(AppleAppSiteAssociationJson, "application/json");

    [HttpGet("/.well-known/assetlinks.json")]
    public ContentResult AssetLinks() =>
        Content(AssetLinksJson, "application/json");
}
