using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using GhostList.Infrastructure.Persistence;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260701000000_AddNemesis")]
    public partial class AddNemesis : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "NemesisExpenses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GhostListId = table.Column<Guid>(type: "uuid", nullable: false),
                    EncryptedPayload = table.Column<string>(type: "text", nullable: false),
                    PayloadInitializationVector = table.Column<string>(type: "text", nullable: false),
                    EncryptedReceiptKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ReceiptBlobKey = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedByDeviceId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CreatedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NemesisExpenses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NemesisExpenses_GhostLists_GhostListId",
                        column: x => x.GhostListId,
                        principalTable: "GhostLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "NemesisVerifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpenseId = table.Column<Guid>(type: "uuid", nullable: false),
                    VerifiedByUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    VerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NemesisVerifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NemesisVerifications_NemesisExpenses_ExpenseId",
                        column: x => x.ExpenseId,
                        principalTable: "NemesisExpenses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "NemesisSettlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GhostListId = table.Column<Guid>(type: "uuid", nullable: false),
                    EncryptedPayload = table.Column<string>(type: "text", nullable: false),
                    PayloadInitializationVector = table.Column<string>(type: "text", nullable: false),
                    IsPaidByPayer = table.Column<bool>(type: "boolean", nullable: false),
                    IsConfirmedByReceiver = table.Column<bool>(type: "boolean", nullable: false),
                    PaidAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConfirmedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PayerDeviceId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    PayerUserId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NemesisSettlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NemesisSettlements_GhostLists_GhostListId",
                        column: x => x.GhostListId,
                        principalTable: "GhostLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_NemesisExpenses_GhostListId_CreatedAt",
                table: "NemesisExpenses",
                columns: new[] { "GhostListId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_NemesisVerifications_ExpenseId_VerifiedByUserId",
                table: "NemesisVerifications",
                columns: new[] { "ExpenseId", "VerifiedByUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_NemesisSettlements_GhostListId",
                table: "NemesisSettlements",
                column: "GhostListId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "NemesisVerifications");
            migrationBuilder.DropTable(name: "NemesisExpenses");
            migrationBuilder.DropTable(name: "NemesisSettlements");
        }
    }
}
