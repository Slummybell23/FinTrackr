using System.Security.Claims;
using System.Text;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class CsvEndpoints
{
    private const string Header = "date,amount,kind,vendor,category,note";

    public static RouteGroupBuilder MapCsv(this RouteGroupBuilder group)
    {
        group.MapGet("/entries.csv", async (ClaimsPrincipal principal, AppDb db) =>
        {
            var entries = await db.Entries
                .Where(e => e.UserId == principal.GetUserId())
                .Include(e => e.Vendor)
                .Include(e => e.Category)
                .OrderBy(e => e.Date).ThenBy(e => e.Id)
                .ToListAsync();

            var sb = new StringBuilder(Header + "\n");
            foreach (var e in entries)
            {
                sb.Append(e.Date.ToString("yyyy-MM-dd")).Append(',')
                    .Append(e.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append(',')
                    .Append(e.Kind).Append(',')
                    .Append(Quote(e.Vendor?.Name)).Append(',')
                    .Append(Quote(e.Category?.Name)).Append(',')
                    .Append(Quote(e.Note)).Append('\n');
            }

            return Results.File(
                Encoding.UTF8.GetBytes(sb.ToString()),
                contentType: "text/csv",
                fileDownloadName: "fintrackr-entries.csv");
        });

        // Accepts the same CSV shape the export produces; creates missing
        // vendors and categories (budget 0) along the way.
        group.MapPost("/entries", async (HttpRequest http, ClaimsPrincipal principal, AppDb db) =>
        {
            using var reader = new StreamReader(http.Body);
            var text = await reader.ReadToEndAsync();
            var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (lines.Length < 2 || !lines[0].StartsWith("date,amount", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = $"First line must be the header: {Header}" });
            if (lines.Length > 10_001)
                return Results.BadRequest(new { error = "Imports are capped at 10,000 rows per request." });

            var userId = principal.GetUserId();
            var categories = (await db.Categories.Where(c => c.UserId == userId).ToListAsync())
                .ToDictionary(c => c.Name.ToLowerInvariant());
            var vendors = (await db.Vendors.Where(v => v.UserId == userId).ToListAsync())
                .ToDictionary(v => v.Name.ToLowerInvariant());

            var imported = 0;
            var errors = new List<string>();
            foreach (var (line, index) in lines.Skip(1).Select((l, i) => (l, i + 2)))
            {
                var cells = ParseCsvLine(line);
                if (cells.Count < 2
                    || !DateOnly.TryParseExact(cells[0], "yyyy-MM-dd", out var date)
                    || !decimal.TryParse(cells[1], System.Globalization.CultureInfo.InvariantCulture, out var amount)
                    || Validation.AmountError(amount) is not null)
                {
                    errors.Add($"Line {index}: needs date (yyyy-MM-dd) and a valid amount.");
                    continue;
                }

                var kind = cells.Count > 2 && cells[2].Equals("Income", StringComparison.OrdinalIgnoreCase)
                    ? EntryKind.Income
                    : EntryKind.Expense;

                Vendor? vendor = null;
                if (cells.Count > 3 && !string.IsNullOrWhiteSpace(cells[3]))
                {
                    var key = cells[3].Trim().ToLowerInvariant();
                    if (!vendors.TryGetValue(key, out vendor))
                    {
                        vendor = new Vendor { UserId = userId, Name = cells[3].Trim() };
                        vendors[key] = vendor;
                    }
                }

                Category? category = null;
                if (cells.Count > 4 && !string.IsNullOrWhiteSpace(cells[4]))
                {
                    var key = cells[4].Trim().ToLowerInvariant();
                    if (!categories.TryGetValue(key, out category))
                    {
                        category = new Category
                        {
                            UserId = userId,
                            Name = cells[4].Trim(),
                            SortOrder = categories.Count,
                        };
                        categories[key] = category;
                    }
                }

                db.Entries.Add(new Entry
                {
                    UserId = userId,
                    Date = date,
                    Amount = amount,
                    Kind = kind,
                    Vendor = vendor,
                    Category = category,
                    Note = cells.Count > 5 && !string.IsNullOrWhiteSpace(cells[5]) ? cells[5] : null,
                });
                imported++;
            }

            await db.SaveChangesAsync();
            return Results.Ok(new { imported, errors });
        });

        return group;
    }

    private static string Quote(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        return value.Contains(',') || value.Contains('"') || value.Contains('\n')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }

    private static List<string> ParseCsvLine(string line)
    {
        var cells = new List<string>();
        var current = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < line.Length && line[i + 1] == '"') { current.Append('"'); i++; }
                else if (c == '"') inQuotes = false;
                else current.Append(c);
            }
            else if (c == '"') inQuotes = true;
            else if (c == ',') { cells.Add(current.ToString()); current.Clear(); }
            else current.Append(c);
        }
        cells.Add(current.ToString());
        return cells;
    }
}
