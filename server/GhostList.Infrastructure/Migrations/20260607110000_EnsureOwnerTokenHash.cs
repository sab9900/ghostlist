using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    /// <summary>
    /// Idempotent guard: adds OwnerTokenHash if it was never actually created
    /// despite the previous migration being recorded in __EFMigrationsHistory.
    /// </summary>
    public partial class EnsureOwnerTokenHash : Migration
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
        }
    }
}
