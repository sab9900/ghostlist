using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddDeviceSubscriptionPreferences : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The previous "AddDeviceSubscriptions" migration was never recognized by EF Core
            // (no Designer.cs / [Migration] attribute existed for it), so it was never applied
            // and the "DeviceSubscriptions" table doesn't exist yet. Create it here directly
            // in its final shape (including the columns this migration was originally meant
            // to add on top of it).
            migrationBuilder.CreateTable(
                name: "DeviceSubscriptions",
                columns: table => new
                {
                    DeviceId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ListId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeviceToken = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Platform = table.Column<int>(type: "integer", nullable: false),
                    NotifyOnMessage = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    NotifyOnItemsChanged = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    RegisteredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeviceSubscriptions", x => new { x.DeviceId, x.ListId });
                    table.ForeignKey(
                        name: "FK_DeviceSubscriptions_GhostLists_ListId",
                        column: x => x.ListId,
                        principalTable: "GhostLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DeviceSubscriptions_DeviceToken",
                table: "DeviceSubscriptions",
                column: "DeviceToken");

            migrationBuilder.CreateIndex(
                name: "IX_DeviceSubscriptions_ListId",
                table: "DeviceSubscriptions",
                column: "ListId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "DeviceSubscriptions");
        }
    }
}
