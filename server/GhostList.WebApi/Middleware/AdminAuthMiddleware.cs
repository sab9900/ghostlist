using System.Security.Cryptography;
using System.Text;

namespace GhostList.WebApi.Middleware;

/// <summary>
/// Protects <c>/api/admin/*</c> with a fixed-credential HTTP Basic Auth check.
/// Credentials are configured via <c>Admin:Username</c> / <c>Admin:Password</c>
/// (e.g. the <c>Admin__Username</c> / <c>Admin__Password</c> environment variables).
/// If no credentials are configured, the admin API is disabled entirely (503).
/// </summary>
public class AdminAuthMiddleware(RequestDelegate next, IConfiguration configuration)
{
    private const string AdminPathPrefix = "/api/admin";

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments(AdminPathPrefix, StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var expectedUsername = configuration["Admin:Username"];
        var expectedPassword = configuration["Admin:Password"];

        if (string.IsNullOrEmpty(expectedUsername) || string.IsNullOrEmpty(expectedPassword))
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await context.Response.WriteAsync("Admin API is not configured.");
            return;
        }

        if (TryGetBasicAuthCredentials(context.Request, out var username, out var password)
            && FixedTimeEquals(username, expectedUsername)
            && FixedTimeEquals(password, expectedPassword))
        {
            await next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        context.Response.Headers.WWWAuthenticate = "Basic realm=\"GhostList Admin\"";
        await context.Response.WriteAsync("Unauthorized");
    }

    private static bool TryGetBasicAuthCredentials(HttpRequest request, out string username, out string password)
    {
        username = string.Empty;
        password = string.Empty;

        var header = request.Headers.Authorization.ToString();
        if (!header.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
            return false;

        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(header["Basic ".Length..].Trim()));
            var separatorIndex = decoded.IndexOf(':');
            if (separatorIndex < 0)
                return false;

            username = decoded[..separatorIndex];
            password = decoded[(separatorIndex + 1)..];
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    /// <summary>Constant-time string comparison to avoid leaking credential length/content via timing.</summary>
    private static bool FixedTimeEquals(string a, string b)
    {
        var aBytes = Encoding.UTF8.GetBytes(a);
        var bBytes = Encoding.UTF8.GetBytes(b);

        if (aBytes.Length != bBytes.Length)
        {
            CryptographicOperations.FixedTimeEquals(aBytes, aBytes);
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(aBytes, bBytes);
    }
}
