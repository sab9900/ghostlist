using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddGhostMessageImages : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GhostMessageImages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GhostListId = table.Column<Guid>(type: "uuid", nullable: false),
                    EncryptedImage = table.Column<string>(type: "text", nullable: false),
                    ImageInitializationVector = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GhostMessageImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GhostMessageImages_GhostChatMessages_Id",
                        column: x => x.Id,
                        principalTable: "GhostChatMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "GhostMessageImages");
        }
    }
}
