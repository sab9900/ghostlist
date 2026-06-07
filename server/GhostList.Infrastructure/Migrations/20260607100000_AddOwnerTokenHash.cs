using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    public partial class AddOwnerTokenHash : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "GhostLists"
                ADD COLUMN IF NOT EXISTS "OwnerTokenHash" character varying(64);
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE "GhostLists"
                DROP COLUMN IF EXISTS "OwnerTokenHash";
                """);
        }
    }
}
