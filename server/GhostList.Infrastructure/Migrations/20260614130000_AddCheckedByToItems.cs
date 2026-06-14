using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddCheckedByToItems : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CheckedByDeviceId",
                table: "GhostListItems",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CheckedByUserId",
                table: "GhostListItems",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CheckedByDeviceId",
                table: "GhostListItems");

            migrationBuilder.DropColumn(
                name: "CheckedByUserId",
                table: "GhostListItems");
        }
    }
}
