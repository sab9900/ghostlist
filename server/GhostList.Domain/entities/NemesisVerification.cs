namespace GhostList.Domain.Entities;

public class NemesisVerification
{
    public Guid Id { get; private set; }
    public Guid ExpenseId { get; private set; }
    public string VerifiedByUserId { get; private set; } = null!;
    public DateTime VerifiedAt { get; private set; }

    private NemesisVerification() { }

    public static NemesisVerification Create(Guid expenseId, string verifiedByUserId)
    {
        return new NemesisVerification
        {
            Id = Guid.NewGuid(),
            ExpenseId = expenseId,
            VerifiedByUserId = verifiedByUserId,
            VerifiedAt = DateTime.UtcNow,
        };
    }
}
