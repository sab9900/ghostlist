using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddCharon : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CharonDrops",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GhostListId = table.Column<Guid>(type: "uuid", nullable: false),
                    EncryptedContent = table.Column<string>(type: "text", nullable: false),
                    ContentInitializationVector = table.Column<string>(type: "text", nullable: false),
                    EncryptedMetadata = table.Column<string>(type: "text", nullable: false),
                    MetadataInitializationVector = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SenderDeviceId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    SenderUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharonDrops", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CharonDrops_GhostLists_GhostListId",
                        column: x => x.GhostListId,
                        principalTable: "GhostLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CharonViewReceipts",
                columns: table => new
                {
                    DropId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeviceId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ViewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharonViewReceipts", x => new { x.DropId, x.DeviceId });
                    table.ForeignKey(
                        name: "FK_CharonViewReceipts_CharonDrops_DropId",
                        column: x => x.DropId,
                        principalTable: "CharonDrops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CharonDrops_GhostListId",
                table: "CharonDrops",
                column: "GhostListId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "CharonViewReceipts");
            migrationBuilder.DropTable(name: "CharonDrops");
        }
    }
}
