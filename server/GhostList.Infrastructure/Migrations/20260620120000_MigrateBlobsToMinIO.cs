using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations;

public partial class MigrateBlobsToMinIO : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "GhostMessageImages");
        migrationBuilder.DropTable(name: "GhostMessageAudios");

        migrationBuilder.DropColumn(name: "EncryptedContent", table: "CharonDrops");
        migrationBuilder.DropColumn(name: "ContentInitializationVector", table: "CharonDrops");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "EncryptedContent",
            table: "CharonDrops",
            type: "text",
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "ContentInitializationVector",
            table: "CharonDrops",
            type: "text",
            nullable: false,
            defaultValue: "");

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
            constraints: table => table.PrimaryKey("PK_GhostMessageImages", x => x.Id));

        migrationBuilder.CreateTable(
            name: "GhostMessageAudios",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                GhostListId = table.Column<Guid>(type: "uuid", nullable: false),
                EncryptedAudio = table.Column<string>(type: "text", nullable: false),
                AudioInitializationVector = table.Column<string>(type: "text", nullable: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_GhostMessageAudios", x => x.Id));
    }
}
