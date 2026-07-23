using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FinTrackr.Api.Migrations
{
    /// <inheritdoc />
    public partial class VendorAliasAndVariableRecurring : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Variable",
                table: "RecurringItems",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Variable",
                table: "RecurringItems");
        }
    }
}
