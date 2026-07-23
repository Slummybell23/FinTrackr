using System.Security.Claims;
using System.Text.RegularExpressions;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

/// <summary>
/// Bank-statement import, the deterministic way: the client maps a CSV's
/// columns into normalized rows, and this endpoint reads them against the
/// book — matching the vendor book (names and aliases), flagging rows that
/// look already kept, tidying bank-speak descriptions — and returns
/// PROPOSALS. Nothing is written until the user reviews and confirms.
/// Saved profiles remember each bank's CSV shape for next month.
/// </summary>
public static class ImportEndpoints
{
    private const int MaxRows = 2000;

    public static RouteGroupBuilder MapImport(this RouteGroupBuilder group)
    {
        group.MapGet("/profiles", (ClaimsPrincipal principal, AppDb db) =>
            db.ImportProfiles
                .Where(p => p.UserId == principal.GetUserId())
                .OrderBy(p => p.Name)
                .Select(p => new { p.Id, p.Name, p.Mapping })
                .ToListAsync());

        // Saving under an existing name updates it — re-mapping a bank is normal.
        group.MapPost("/profiles", async (ImportProfileRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.NameError(request.Name) is { } error)
                return Results.BadRequest(new { error });
            if (request.Mapping.Length is 0 or > 2000)
                return Results.BadRequest(new { error = "Mapping payload is out of size." });

            var userId = principal.GetUserId();
            var profile = await db.ImportProfiles.FirstOrDefaultAsync(
                p => p.UserId == userId && p.Name == request.Name);
            if (profile is null)
            {
                profile = new ImportProfile { UserId = userId, Name = request.Name.Trim() };
                db.ImportProfiles.Add(profile);
            }
            profile.Mapping = request.Mapping;
            await db.SaveChangesAsync();
            return Results.Ok(new { profile.Id, profile.Name, profile.Mapping });
        });

        group.MapDelete("/profiles/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var deleted = await db.ImportProfiles
                .Where(p => p.Id == id && p.UserId == principal.GetUserId())
                .ExecuteDeleteAsync();
            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        });

        group.MapPost("/propose", async (ProposeRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (request.Rows is null or { Count: 0 })
                return Results.BadRequest(new { error = "No rows to read." });
            if (request.Rows.Count > MaxRows)
                return Results.BadRequest(new { error = $"Imports are capped at {MaxRows} rows." });

            var warnings = new List<string>();
            var rows = new List<ImportRow>();
            foreach (var row in request.Rows)
            {
                var valid = DateOnly.TryParse(row.Date, out _)
                            && row.Amount > 0 && row.Amount <= Validation.MaxAmount
                            && !string.IsNullOrWhiteSpace(row.Description)
                            && row.Kind is "Expense" or "Income";
                if (valid) rows.Add(row);
            }
            if (rows.Count < request.Rows.Count)
                warnings.Add($"{request.Rows.Count - rows.Count} rows couldn't be read and were left out.");
            if (rows.Count == 0)
                return Results.Ok(new ProposeResult([], warnings));
            rows = rows.OrderBy(r => r.Date).ToList();

            var userId = principal.GetUserId();
            var vendors = await db.Vendors.Where(v => v.UserId == userId).ToListAsync();
            var categoryNames = await db.Categories.Where(c => c.UserId == userId)
                .ToDictionaryAsync(c => c.Id, c => c.Name);

            // A statement overlaps what's already hand-kept; flag those rows.
            var minDate = DateOnly.Parse(rows[0].Date);
            var maxDate = DateOnly.Parse(rows[^1].Date);
            var existing = (await db.Entries
                    .Where(e => e.UserId == userId && e.Date >= minDate && e.Date <= maxDate)
                    .Select(e => new { e.Date, e.Amount, e.Kind })
                    .ToListAsync())
                .Select(e => (e.Date, e.Amount, e.Kind.ToString()))
                .ToHashSet();

            var proposals = rows.Select(row =>
            {
                var duplicate = existing.Contains((DateOnly.Parse(row.Date), row.Amount, row.Kind));
                var vendor = vendors.FirstOrDefault(v =>
                    (v.Name.Length >= 3 && row.Description.Contains(v.Name, StringComparison.OrdinalIgnoreCase))
                    || (v.Alias is { Length: >= 3 } alias
                        && row.Description.Contains(alias, StringComparison.OrdinalIgnoreCase)));

                if (vendor is not null)
                {
                    var categoryId = row.Kind == "Expense" ? vendor.DefaultCategoryId : null;
                    return new ImportProposal(
                        row.Date, row.Amount, row.Kind, row.Description, vendor.Name,
                        categoryId, categoryId is { } id ? categoryNames.GetValueOrDefault(id) : null,
                        Matched: true, duplicate, Include: !duplicate);
                }

                return new ImportProposal(
                    row.Date, row.Amount, row.Kind, row.Description, CleanDescription(row.Description),
                    null, null, Matched: false, duplicate, Include: !duplicate);
            }).ToList();

            return Results.Ok(new ProposeResult(proposals, warnings));
        });

        return group;
    }

    // Processor noise that prefixes half of all statement lines.
    private static readonly string[] NoisePrefixes =
    [
        "PURCHASE AUTHORIZED ON", "DEBIT CARD PURCHASE", "POS DEBIT", "POS PURCHASE",
        "CHECKCARD", "CHECK CARD", "DEBIT PURCHASE", "RECURRING PAYMENT",
        "TST*", "TST *", "SQ *", "SQ*", "PAYPAL *", "PAYPAL*", "PYPL*", "PP*",
    ];

    private static readonly Regex JunkToken = new(
        @"^(#?\d{3,}|x{2,}\d+|\d{1,2}/\d{1,2}(/\d{2,4})?)$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>Bank-speak into something a vendor could be called: strip
    /// processor prefixes and number junk, settle the shouting.</summary>
    internal static string CleanDescription(string raw)
    {
        var text = raw.Trim();
        foreach (var prefix in NoisePrefixes)
        {
            if (text.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                text = text[prefix.Length..].TrimStart(' ', '-', '*', ':');
        }

        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(t => !JunkToken.IsMatch(t))
            .ToList();
        if (tokens.Count > 0) text = string.Join(' ', tokens);

        // ALL CAPS reads like a demand; settle it into title case.
        if (text.Length > 1 && text.Any(char.IsLetter) && text == text.ToUpperInvariant())
        {
            text = string.Join(' ', text.Split(' ').Select(word =>
                word.Length <= 1 ? word : char.ToUpperInvariant(word[0]) + word[1..].ToLowerInvariant()));
        }

        text = text.Trim();
        if (text.Length == 0) text = raw.Trim();
        return text.Length <= 100 ? text : text[..100];
    }
}
