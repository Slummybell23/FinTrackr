using System.Security.Claims;
using FinTrackr.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class ExportEndpoints
{
    /// <summary>
    /// The whole account in one JSON file — categories, vendors, entries,
    /// recurring, goals, debts, quick-adds — so anyone can carry their book
    /// out, not just the admin's per-instance database download.
    /// </summary>
    public static RouteGroupBuilder MapExport(this RouteGroupBuilder group)
    {
        group.MapGet("/", async (ClaimsPrincipal principal, AppDb db, TimeProvider clock) =>
        {
            var userId = principal.GetUserId();

            var payload = new
            {
                exportedAt = clock.GetUtcNow().ToString("O"),
                schema = 1,
                categories = await db.Categories.Where(c => c.UserId == userId)
                    .OrderBy(c => c.SortOrder)
                    .Select(c => new { c.Name, c.Emoji, c.MonthlyBudget, c.SortOrder, c.Group })
                    .ToListAsync(),
                vendors = await db.Vendors.Where(v => v.UserId == userId)
                    .Select(v => new { v.Name, v.Alias, DefaultCategory = v.DefaultCategory!.Name })
                    .ToListAsync(),
                entries = await db.Entries.Where(e => e.UserId == userId)
                    .Include(e => e.Vendor).Include(e => e.Category).Include(e => e.Debt)
                    .OrderBy(e => e.Date).ThenBy(e => e.Id)
                    .Select(e => new
                    {
                        e.Date,
                        e.Amount,
                        Kind = e.Kind.ToString(),
                        Vendor = e.Vendor!.Name,
                        Category = e.Category!.Name,
                        e.Note,
                        Tags = e.Tags,
                        e.Worth,
                        Debt = e.Debt!.Name,
                    })
                    .ToListAsync(),
                recurring = await db.RecurringItems.Where(r => r.UserId == userId)
                    .Include(r => r.Category)
                    .Select(r => new
                    {
                        r.Name,
                        r.Amount,
                        Cadence = r.Cadence.ToString(),
                        r.NextDate,
                        r.Variable,
                        Category = r.Category!.Name,
                    })
                    .ToListAsync(),
                goals = await db.SavingsGoals.Where(g => g.UserId == userId)
                    .Select(g => new { g.Name, g.TargetAmount, g.SavedAmount, g.TargetDate })
                    .ToListAsync(),
                debts = await db.Debts.Where(d => d.UserId == userId)
                    .Select(d => new { d.Name, d.StartingAmount, d.PaidAmount, Kind = d.Kind.ToString() })
                    .ToListAsync(),
                quickAdds = await db.EntryTemplates.Where(t => t.UserId == userId)
                    .Select(t => new { t.Name, t.Amount, t.VendorName })
                    .ToListAsync(),
            };

            return Results.File(
                System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(payload,
                    new System.Text.Json.JsonSerializerOptions { WriteIndented = true }),
                contentType: "application/json",
                fileDownloadName: "fintrackr-account.json");
        });

        return group;
    }
}
