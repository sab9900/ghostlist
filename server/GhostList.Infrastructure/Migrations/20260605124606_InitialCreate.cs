using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GhostChatMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GhostListId = table.Column<Guid>(type: "uuid", nullable: false),
                    EncryptedMessage = table.Column<string>(type: "text", nullable: false),
                    InitializationVector = table.Column<string>(type: "text", nullable: false),
                    EncryptedSenderName = table.Column<string>(type: "text", nullable: false),
                    SenderNameInitializationVector = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GhostChatMessages", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GhostListItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GhostListId = table.Column<Guid>(type: "uuid", nullable: false),
                    EncryptedPayload = table.Column<string>(type: "text", nullable: false),
                    InitializationVector = table.Column<string>(type: "text", nullable: false),
                    IsChecked = table.Column<bool>(type: "boolean", nullable: false),
                    CheckedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GhostListItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GhostLists",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ColmpletedItemsTtl = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GhostLists", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GhostChatMessages_GhostListId",
                table: "GhostChatMessages",
                column: "GhostListId");

            migrationBuilder.CreateIndex(
                name: "IX_GhostListItems_GhostListId",
                table: "GhostListItems",
                column: "GhostListId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GhostChatMessages");

            migrationBuilder.DropTable(
                name: "GhostListItems");

            migrationBuilder.DropTable(
                name: "GhostLists");
        }
    }
}
