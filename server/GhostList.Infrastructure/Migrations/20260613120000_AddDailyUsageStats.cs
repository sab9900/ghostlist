using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddDailyUsageStats : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DailyUsageStats",
                columns: table => new
                {
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    ListsCreated = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    ItemsCreated = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    MessagesCreated = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    MembersCreated = table.Column<int>(type: "integer", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyUsageStats", x => x.Date);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "DailyUsageStats");
        }
    }
}
