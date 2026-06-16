using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddItemReminderAcknowledged : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsAcknowledged",
                table: "ItemReminders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_ItemReminders_IsAcknowledged_RemindAt",
                table: "ItemReminders",
                columns: new[] { "IsAcknowledged", "RemindAt" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ItemReminders_IsAcknowledged_RemindAt",
                table: "ItemReminders");

            migrationBuilder.DropColumn(
                name: "IsAcknowledged",
                table: "ItemReminders");
        }
    }
}
