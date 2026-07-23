using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class EntryEndpoints
{
    public static RouteGroupBuilder MapEntries(this RouteGroupBuilder group)
    {
        // ?month=2026-07 filters to a calendar month; ?search= matches vendor name or note.
        // Also filters by ?kind=, ?minAmount=, ?maxAmount=; pages with ?limit=/?offset=.
        group.MapGet("/", async (ClaimsPrincipal principal, AppDb db,
            string? month, string? search, int? categoryId, string? kind,
            decimal? minAmount, decimal? maxAmount, int? limit, int? offset, string? tag, int? vendorId) =>
        {
            var query = db.Entries
                .Where(e => e.UserId == principal.GetUserId())
                .Include(e => e.Vendor)
                .Include(e => e.Category)
                .Include(e => e.Debt)
                .AsQueryable();

            if (Enum.TryParse<EntryKind>(kind, ignoreCase: true, out var parsedKind))
                query = query.Where(e => e.Kind == parsedKind);

            // Tags are stored comma-joined; wrap in delimiters so "car" ≠ "cargo".
            if (EntryTags.Normalize([tag ?? ""]) is { } wantedTag)
                query = query.Where(e => e.Tags != null && ("," + e.Tags + ",").Contains("," + wantedTag + ","));
            if (minAmount is not null)
                query = query.Where(e => e.Amount >= minAmount);
            if (maxAmount is not null)
                query = query.Where(e => e.Amount <= maxAmount);

            if (month is not null && TryParseMonth(month, out var start, out var end))
                query = query.Where(e => e.Date >= start && e.Date < end);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                query = query.Where(e =>
                    (e.Vendor != null && e.Vendor.Name.ToLower().Contains(term)) ||
                    (e.Note != null && e.Note.ToLower().Contains(term)));
            }

            if (categoryId is not null)
                query = query.Where(e => e.CategoryId == categoryId);

            if (vendorId is not null)
                query = query.Where(e => e.VendorId == vendorId);

            var entries = await query
                .OrderByDescending(e => e.Date)
                .ThenByDescending(e => e.Id)
                .Skip(Math.Max(0, offset ?? 0))
                .Take(Math.Clamp(limit ?? 200, 1, 500))
                .ToListAsync();
            return entries.Select(EntryResponse.From);
        });

        group.MapGet("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var entry = await db.Entries
                .Include(e => e.Vendor)
                .Include(e => e.Category)
                .Include(e => e.Debt)
                .FirstOrDefaultAsync(e => e.Id == id && e.UserId == principal.GetUserId());
            return entry is null ? Results.NotFound() : Results.Ok(EntryResponse.From(entry));
        });

        group.MapPost("/", async (EntryRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error)
                return Results.BadRequest(new { error });

            var userId = principal.GetUserId();
            if (!await OwnsCategory(request.CategoryId, userId, db))
                return Results.BadRequest(new { error = "Unknown category." });
            var debt = await OwnedDebt(request.DebtId, userId, db);
            if (request.DebtId is not null && debt is null)
                return Results.BadRequest(new { error = "Unknown debt." });

            var entry = new Entry
            {
                UserId = userId,
                Amount = request.Amount,
                Date = request.Date,
                CategoryId = request.CategoryId,
                Note = request.Note,
                Kind = request.Kind,
                DebtId = request.DebtId,
                Tags = EntryTags.Normalize(request.Tags),
                Vendor = await ResolveVendor(request.VendorName, userId, db),
            };
            if (debt is not null)
                Pay(debt, entry.Amount);

            // Vendor memory: a known vendor files the entry into its usual category,
            // and a vendor without one learns it from the first hand-filed entry.
            entry.CategoryId ??= entry.Vendor?.DefaultCategoryId;
            if (entry.Vendor is not null)
                entry.Vendor.DefaultCategoryId ??= request.CategoryId;

            db.Entries.Add(entry);
            await db.SaveChangesAsync();
            await db.Entry(entry).Reference(e => e.Category).LoadAsync();
            await db.Entry(entry).Reference(e => e.Debt).LoadAsync();
            return Results.Created($"/api/entries/{entry.Id}", EntryResponse.From(entry));
        });

        group.MapPut("/{id:int}", async (int id, EntryRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error)
                return Results.BadRequest(new { error });

            var userId = principal.GetUserId();
            var entry = await db.Entries
                .Include(e => e.Vendor)
                .FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);
            if (entry is null) return Results.NotFound();
            if (!await OwnsCategory(request.CategoryId, userId, db))
                return Results.BadRequest(new { error = "Unknown category." });
            var newDebt = await OwnedDebt(request.DebtId, userId, db);
            if (request.DebtId is not null && newDebt is null)
                return Results.BadRequest(new { error = "Unknown debt." });

            if (await OwnedDebt(entry.DebtId, userId, db) is { } oldDebt)
                Pay(oldDebt, -entry.Amount);

            entry.Amount = request.Amount;
            entry.Date = request.Date;
            entry.CategoryId = request.CategoryId;
            entry.Note = request.Note;
            entry.Kind = request.Kind;
            entry.DebtId = request.DebtId;
            entry.Tags = EntryTags.Normalize(request.Tags);
            entry.Vendor = await ResolveVendor(request.VendorName, userId, db);
            if (newDebt is not null)
                Pay(newDebt, entry.Amount);
            await db.SaveChangesAsync();
            await db.Entry(entry).Reference(e => e.Category).LoadAsync();
            await db.Entry(entry).Reference(e => e.Debt).LoadAsync();
            return Results.Ok(EntryResponse.From(entry));
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var userId = principal.GetUserId();
            var entry = await db.Entries.FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);
            if (entry is null) return Results.NotFound();

            if (await OwnedDebt(entry.DebtId, userId, db) is { } debt)
                Pay(debt, -entry.Amount);
            db.Entries.Remove(entry);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // The worth-it verdict: one tap to weigh an expense (or clear it).
        group.MapPost("/{id:int}/worth", async (int id, WorthRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            var verdict = request.Worth;
            if (verdict is not (null or "Worth" or "Regret"))
                return Results.BadRequest(new { error = "Worth must be \"Worth\", \"Regret\", or null." });

            var entry = await db.Entries
                .Include(e => e.Vendor).Include(e => e.Category).Include(e => e.Debt)
                .FirstOrDefaultAsync(e => e.Id == id && e.UserId == principal.GetUserId());
            if (entry is null) return Results.NotFound();

            entry.Worth = verdict;
            await db.SaveChangesAsync();
            return Results.Ok(EntryResponse.From(entry));
        });

        return group;
    }

    private static async Task<Debt?> OwnedDebt(int? debtId, string userId, AppDb db) =>
        debtId is null
            ? null
            : await db.Debts.FirstOrDefaultAsync(d => d.Id == debtId && d.UserId == userId);

    private static void Pay(Debt debt, decimal delta) =>
        debt.PaidAmount = Math.Clamp(debt.PaidAmount + delta, 0, debt.StartingAmount);

    private static async Task<bool> OwnsCategory(int? categoryId, string userId, AppDb db) =>
        categoryId is null
        || await db.Categories.AnyAsync(c => c.Id == categoryId && c.UserId == userId);

    private static async Task<Vendor?> ResolveVendor(string? name, string userId, AppDb db)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var trimmed = name.Trim();
        return await db.Vendors.FirstOrDefaultAsync(v => v.UserId == userId
                && (v.Name.ToLower() == trimmed.ToLower()
                    || (v.Alias != null && v.Alias.ToLower() == trimmed.ToLower())))
            ?? new Vendor { UserId = userId, Name = trimmed };
    }

    internal static bool TryParseMonth(string month, out DateOnly start, out DateOnly end)
    {
        if (DateOnly.TryParseExact($"{month}-01", "yyyy-MM-dd", out start))
        {
            end = start.AddMonths(1);
            return true;
        }
        end = default;
        return false;
    }
}
