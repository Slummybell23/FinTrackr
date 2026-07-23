using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FinTrackr.Api.Migrations
{
    /// <inheritdoc />
    public partial class CoachingFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "TargetDate",
                table: "SavingsGoals",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "AmountChangedAt",
                table: "RecurringItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PreviousAmount",
                table: "RecurringItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Worth",
                table: "Entries",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Challenges",
                table: "AspNetUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "MonthlySavingsTarget",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "OverspendNudge",
                table: "AspNetUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "Reflection",
                table: "AspNetUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "SavingsRateTarget",
                table: "AspNetUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "Challenges",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    Kind = table.Column<string>(type: "TEXT", nullable: false),
                    Target = table.Column<decimal>(type: "TEXT", nullable: false),
                    CategoryId = table.Column<int>(type: "INTEGER", nullable: true),
                    Month = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Challenges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Challenges_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SavingsContributions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    GoalId = table.Column<int>(type: "INTEGER", nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", nullable: false),
                    Date = table.Column<DateOnly>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavingsContributions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Challenges_CategoryId",
                table: "Challenges",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Challenges_UserId",
                table: "Challenges",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SavingsContributions_UserId_Date",
                table: "SavingsContributions",
                columns: new[] { "UserId", "Date" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Challenges");

            migrationBuilder.DropTable(
                name: "SavingsContributions");

            migrationBuilder.DropColumn(
                name: "TargetDate",
                table: "SavingsGoals");

            migrationBuilder.DropColumn(
                name: "AmountChangedAt",
                table: "RecurringItems");

            migrationBuilder.DropColumn(
                name: "PreviousAmount",
                table: "RecurringItems");

            migrationBuilder.DropColumn(
                name: "Worth",
                table: "Entries");

            migrationBuilder.DropColumn(
                name: "Challenges",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "MonthlySavingsTarget",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "OverspendNudge",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "Reflection",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "SavingsRateTarget",
                table: "AspNetUsers");
        }
    }
}
