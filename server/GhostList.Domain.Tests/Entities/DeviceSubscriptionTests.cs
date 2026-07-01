using FluentAssertions;
using GhostList.Domain.Entities;

namespace GhostList.Domain.Tests.Entities;

public class DeviceSubscriptionTests
{
    private static readonly Guid ListId = Guid.NewGuid();

    [Fact]
    public void Create_WithUserId_SetsUserIdCorrectly()
    {
        var sub = DeviceSubscription.Create("device-1", ListId, "token", DevicePlatform.Ios, userId: "user-abc");

        sub.UserId.Should().Be("user-abc");
    }

    [Fact]
    public void Create_WithoutUserId_UserIdIsNull()
    {
        var sub = DeviceSubscription.Create("device-1", ListId, "token", DevicePlatform.Android);

        sub.UserId.Should().BeNull();
    }

    [Fact]
    public void UpdateUserId_SetsUserId()
    {
        var sub = DeviceSubscription.Create("device-1", ListId, "token", DevicePlatform.Ios);

        sub.UpdateUserId("user-xyz");

        sub.UserId.Should().Be("user-xyz");
    }

    [Fact]
    public void UpdateUserId_UpdatesUpdatedAt()
    {
        var sub = DeviceSubscription.Create("device-1", ListId, "token", DevicePlatform.Ios);
        var before = DateTimeOffset.UtcNow;

        sub.UpdateUserId("user-xyz");

        sub.UpdatedAt.Should().BeOnOrAfter(before);
    }

    [Fact]
    public void UpdateUserId_WithNull_ClearsUserId()
    {
        var sub = DeviceSubscription.Create("device-1", ListId, "token", DevicePlatform.Ios, userId: "user-abc");

        sub.UpdateUserId(null);

        sub.UserId.Should().BeNull();
    }
}
