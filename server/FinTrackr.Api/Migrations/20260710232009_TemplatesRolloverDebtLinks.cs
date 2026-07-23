using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FinTrackr.Api.Migrations
{
    /// <inheritdoc />
    public partial class TemplatesRolloverDebtLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DebtId",
                table: "Entries",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RolloverBudgets",
                table: "AspNetUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "EntryTemplates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", nullable: false),
                    VendorName = table.Column<string>(type: "TEXT", nullable: true),
                    CategoryId = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntryTemplates", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Entries_DebtId",
                table: "Entries",
                column: "DebtId");

            migrationBuilder.CreateIndex(
                name: "IX_EntryTemplates_UserId",
                table: "EntryTemplates",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Entries_Debts_DebtId",
                table: "Entries",
                column: "DebtId",
                principalTable: "Debts",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Entries_Debts_DebtId",
                table: "Entries");

            migrationBuilder.DropTable(
                name: "EntryTemplates");

            migrationBuilder.DropIndex(
                name: "IX_Entries_DebtId",
                table: "Entries");

            migrationBuilder.DropColumn(
                name: "DebtId",
                table: "Entries");

            migrationBuilder.DropColumn(
                name: "RolloverBudgets",
                table: "AspNetUsers");
        }
    }
}
