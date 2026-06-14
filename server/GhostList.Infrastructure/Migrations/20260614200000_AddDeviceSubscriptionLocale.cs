using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    /// <summary>
    /// Adds the client's UI language (e.g. "en_US", "de_DE") to each push subscription, so
    /// FcmNotificationService can send notification text in the recipient's language. Existing
    /// rows get null and fall back to the default language until the client re-subscribes.
    /// </summary>
    public partial class AddDeviceSubscriptionLocale : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Locale",
                table: "DeviceSubscriptions",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Locale",
                table: "DeviceSubscriptions");
        }
    }
}
