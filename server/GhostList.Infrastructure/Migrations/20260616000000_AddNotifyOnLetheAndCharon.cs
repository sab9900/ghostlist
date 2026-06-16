using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{

    public partial class AddNotifyOnLetheAndCharon : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "NotifyOnLethe",
                table: "DeviceSubscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "NotifyOnCharon",
                table: "DeviceSubscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NotifyOnLethe",
                table: "DeviceSubscriptions");

            migrationBuilder.DropColumn(
                name: "NotifyOnCharon",
                table: "DeviceSubscriptions");
        }
    }
}
