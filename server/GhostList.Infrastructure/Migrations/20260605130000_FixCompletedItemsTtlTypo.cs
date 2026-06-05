using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixCompletedItemsTtlTypo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ColmpletedItemsTtl",
                table: "GhostLists",
                newName: "CompletedItemsTtl");

            migrationBuilder.AddForeignKey(
                name: "FK_GhostChatMessages_GhostLists_GhostListId",
                table: "GhostChatMessages",
                column: "GhostListId",
                principalTable: "GhostLists",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_GhostListItems_GhostLists_GhostListId",
                table: "GhostListItems",
                column: "GhostListId",
                principalTable: "GhostLists",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GhostChatMessages_GhostLists_GhostListId",
                table: "GhostChatMessages");

            migrationBuilder.DropForeignKey(
                name: "FK_GhostListItems_GhostLists_GhostListId",
                table: "GhostListItems");

            migrationBuilder.RenameColumn(
                name: "CompletedItemsTtl",
                table: "GhostLists",
                newName: "ColmpletedItemsTtl");
        }
    }
}
