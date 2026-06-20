using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddUserIdToReadReceipts : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "MessageReadReceipts",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "ItemReadReceipts",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UserId",
                table: "CharonViewReceipts",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_MessageReadReceipts_MessageId_UserId",
                table: "MessageReadReceipts",
                columns: new[] { "MessageId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_ItemReadReceipts_ItemId_UserId",
                table: "ItemReadReceipts",
                columns: new[] { "ItemId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_CharonViewReceipts_DropId_UserId",
                table: "CharonViewReceipts",
                columns: new[] { "DropId", "UserId" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MessageReadReceipts_MessageId_UserId",
                table: "MessageReadReceipts");

            migrationBuilder.DropIndex(
                name: "IX_ItemReadReceipts_ItemId_UserId",
                table: "ItemReadReceipts");

            migrationBuilder.DropIndex(
                name: "IX_CharonViewReceipts_DropId_UserId",
                table: "CharonViewReceipts");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "MessageReadReceipts");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "ItemReadReceipts");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "CharonViewReceipts");
        }
    }
}
