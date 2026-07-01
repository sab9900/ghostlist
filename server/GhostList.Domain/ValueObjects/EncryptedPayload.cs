namespace GhostList.Domain.ValueObjects;

public sealed record EncryptedPayload(string Ciphertext, string Nonce)
{
    public static EncryptedPayload Empty => new(string.Empty, string.Empty);
}
