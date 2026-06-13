using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddReplyAndReadReceipts : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ReplyToMessageId",
                table: "GhostChatMessages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastReadMessageAt",
                table: "GhostListMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastReadItemAt",
                table: "GhostListMembers",
                type: "timestamp with time zone",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReplyToMessageId",
                table: "GhostChatMessages");

            migrationBuilder.DropColumn(
                name: "LastReadMessageAt",
                table: "GhostListMembers");

            migrationBuilder.DropColumn(
                name: "LastReadItemAt",
                table: "GhostListMembers");
        }
    }
}
