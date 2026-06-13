using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    // NOTE: This migration was never recognized by EF Core (no Designer.cs / [Migration]
    // attribute was ever generated for it), so it was never applied to any database and
    // the "DeviceSubscriptions" table was never created by it. Its CreateTable logic has
    // been folded into 20260613130000_AddDeviceSubscriptionPreferences, which now creates
    // the table directly in its final shape. This class is left as an inert stub (no
    // [Migration] attribute, so EF still ignores it) to avoid renumbering history for
    // anyone who may have a Designer.cs generated locally referencing this file.
    public partial class AddDeviceSubscriptions : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
