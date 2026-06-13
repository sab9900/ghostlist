using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    /// <summary>
    /// Switches "items changed" push notifications from opt-out to opt-in:
    /// existing subscriptions are reset to NotifyOnItemsChanged = false, and
    /// the column default for new rows is changed to false. "New message"
    /// notifications remain opt-out (NotifyOnMessage default stays true).
    /// </summary>
    public partial class ItemsChangedOptIn : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "UPDATE \"DeviceSubscriptions\" SET \"NotifyOnItemsChanged\" = false;");

            migrationBuilder.AlterColumn<bool>(
                name: "NotifyOnItemsChanged",
                table: "DeviceSubscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: false,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldDefaultValue: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<bool>(
                name: "NotifyOnItemsChanged",
                table: "DeviceSubscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: true,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldDefaultValue: false);
        }
    }
}
