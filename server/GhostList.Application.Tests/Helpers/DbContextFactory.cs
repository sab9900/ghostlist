using GhostList.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GhostList.Application.Tests.Helpers;

internal static class DbContextFactory
{
    public static ApplicationDbContext Create()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new ApplicationDbContext(options);
    }
}
