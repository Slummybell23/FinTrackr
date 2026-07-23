using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FinTrackr.Api.Migrations
{
    /// <inheritdoc />
    public partial class DebtKinds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "Debts",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Kind",
                table: "Debts");
        }
    }
}
