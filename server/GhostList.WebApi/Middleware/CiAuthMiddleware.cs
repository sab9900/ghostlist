namespace GhostList.WebApi.Middleware;

/// <summary>
/// Protects <c>/api/ci/*</c> with a single shared-secret header, separate from the admin
/// credentials. This lets the CI pipeline (e.g. the Android release workflow) trigger a
/// narrowly-scoped action — like posting a release announcement — without holding the
/// full admin login.
///
/// The secret is configured via <c>Ci:Token</c> (e.g. the <c>Ci__Token</c> environment
/// variable) and must be sent as the <c>X-Ci-Token</c> request header. If no token is
/// configured, the CI API is disabled entirely (503).
/// </summary>
public class CiAuthMiddleware(RequestDelegate next, IConfiguration configuration)
{
    private const string CiPathPrefix = "/api/ci";
    private const string TokenHeader = "X-Ci-Token";

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments(CiPathPrefix, StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var expectedToken = configuration["Ci:Token"];

        if (string.IsNullOrEmpty(expectedToken))
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsync("CI API is not configured.");
            return;
        }

        var providedToken = context.Request.Headers[TokenHeader].ToString();

        if (!string.IsNullOrEmpty(providedToken) && SecretComparer.FixedTimeEquals(providedToken, expectedToken))
        {
            await next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsync("Unauthorized");
    }
}
