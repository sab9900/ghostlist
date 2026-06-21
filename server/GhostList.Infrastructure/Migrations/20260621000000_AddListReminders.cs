using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddListReminders : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ListReminders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GhostListId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeviceId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RemindAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsSent = table.Column<bool>(type: "boolean", nullable: false),
                    IsAcknowledged = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ListReminders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ListReminders_GhostLists_GhostListId",
                        column: x => x.GhostListId,
                        principalTable: "GhostLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ListReminders_IsSent_RemindAt",
                table: "ListReminders",
                columns: new[] { "IsSent", "RemindAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ListReminders_IsAcknowledged_RemindAt",
                table: "ListReminders",
                columns: new[] { "IsAcknowledged", "RemindAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ListReminders_GhostListId",
                table: "ListReminders",
                column: "GhostListId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "ListReminders");
        }
    }
}
