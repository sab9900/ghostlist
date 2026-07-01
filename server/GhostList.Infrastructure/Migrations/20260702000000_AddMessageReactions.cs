using System;
using GhostList.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260702000000_AddMessageReactions")]
    public partial class AddMessageReactions : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GhostMessageReactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    GhostListId = table.Column<Guid>(type: "uuid", nullable: false),
                    EncryptedEmoji = table.Column<string>(type: "text", nullable: false),
                    EmojiInitializationVector = table.Column<string>(type: "text", nullable: false),
                    EncryptedSenderName = table.Column<string>(type: "text", nullable: false),
                    SenderNameInitializationVector = table.Column<string>(type: "text", nullable: false),
                    SenderDeviceId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    SenderUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GhostMessageReactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GhostMessageReactions_GhostChatMessages_MessageId",
                        column: x => x.MessageId,
                        principalTable: "GhostChatMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GhostMessageReactions_MessageId",
                table: "GhostMessageReactions",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_GhostMessageReactions_MessageId_SenderDeviceId",
                table: "GhostMessageReactions",
                columns: new[] { "MessageId", "SenderDeviceId" });

            migrationBuilder.CreateIndex(
                name: "IX_GhostMessageReactions_MessageId_SenderUserId",
                table: "GhostMessageReactions",
                columns: new[] { "MessageId", "SenderUserId" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GhostMessageReactions");
        }
    }
}
