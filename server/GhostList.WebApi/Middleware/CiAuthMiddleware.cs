namespace GhostList.WebApi.Middleware;

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
