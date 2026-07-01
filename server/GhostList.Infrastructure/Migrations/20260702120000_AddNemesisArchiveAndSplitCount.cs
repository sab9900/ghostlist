using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using GhostList.Infrastructure.Persistence;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260702120000_AddNemesisArchiveAndSplitCount")]
    public partial class AddNemesisArchiveAndSplitCount : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SplitCount",
                table: "NemesisExpenses",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                table: "NemesisExpenses",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_NemesisExpenses_GhostListId_IsArchived",
                table: "NemesisExpenses",
                columns: new[] { "GhostListId", "IsArchived" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_NemesisExpenses_GhostListId_IsArchived",
                table: "NemesisExpenses");

            migrationBuilder.DropColumn(
                name: "SplitCount",
                table: "NemesisExpenses");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                table: "NemesisExpenses");
        }
    }
}
