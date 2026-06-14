using System.Security.Cryptography;
using System.Text;

namespace GhostList.WebApi.Middleware;

/// <summary>Constant-time string comparison helpers, shared by the auth middlewares.</summary>
public static class SecretComparer
{
    /// <summary>Constant-time string comparison to avoid leaking credential length/content via timing.</summary>
    public static bool FixedTimeEquals(string a, string b)
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
