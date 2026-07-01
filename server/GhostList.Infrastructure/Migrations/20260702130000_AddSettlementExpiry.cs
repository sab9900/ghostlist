using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using GhostList.Infrastructure.Persistence;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260702130000_AddSettlementExpiry")]
    public partial class AddSettlementExpiry : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "NemesisSettlementExpiryDays",
                table: "GhostLists",
                type: "integer",
                nullable: false,
                defaultValue: 60);

            migrationBuilder.AddColumn<int>(
                name: "NemesisSettlementHideAfterDays",
                table: "GhostLists",
                type: "integer",
                nullable: false,
                defaultValue: 30);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "NemesisSettlements",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "ResolvedAt",
                table: "NemesisSettlements",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReceiverUserId",
                table: "NemesisSettlements",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_NemesisSettlements_GhostListId_Status",
                table: "NemesisSettlements",
                columns: new[] { "GhostListId", "Status" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_NemesisSettlements_GhostListId_Status",
                table: "NemesisSettlements");

            migrationBuilder.DropColumn(
                name: "ReceiverUserId",
                table: "NemesisSettlements");

            migrationBuilder.DropColumn(
                name: "ResolvedAt",
                table: "NemesisSettlements");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "NemesisSettlements");

            migrationBuilder.DropColumn(
                name: "NemesisSettlementExpiryDays",
                table: "GhostLists");

            migrationBuilder.DropColumn(
                name: "NemesisSettlementHideAfterDays",
                table: "GhostLists");
        }
    }
}
