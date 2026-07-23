using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class SummaryEndpoints
{
    public static RouteGroupBuilder MapSummary(this RouteGroupBuilder group)
    {
        // The Home screen in one call: left to spend, per-category lines, no-spend days.
        group.MapGet("/month/{month}", async (string month, ClaimsPrincipal principal, AppDb db, TimeProvider clock) =>
        {
            if (!EntryEndpoints.TryParseMonth(month, out var start, out var end))
                return Results.BadRequest(new { error = "Month must look like 2026-07." });

            var userId = principal.GetUserId();
            var entries = await db.Entries
                .Where(e => e.UserId == userId && e.Date >= start && e.Date < end)
                .Select(e => new { e.CategoryId, e.Amount, e.Date, e.Kind })
                .ToListAsync();
            var categories = await db.Categories
                .Where(c => c.UserId == userId)
                .OrderBy(c => c.SortOrder)
                .ToListAsync();

            // SQLite stores decimal as TEXT, so aggregate in memory; a month of entries stays small.
            var expenses = entries.Where(e => e.Kind == EntryKind.Expense).ToList();
            var spentByCategory = expenses
                .Where(e => e.CategoryId is not null)
                .GroupBy(e => e.CategoryId!.Value)
                .ToDictionary(g => g.Key, g => g.Sum(e => e.Amount));

            var budgetTotal = categories.Sum(c => c.MonthlyBudget);
            var spent = expenses.Sum(e => e.Amount);
            var income = entries.Where(e => e.Kind == EntryKind.Income).Sum(e => e.Amount);

            // Envelope rollover: months you actually kept the book carry their
            // remainder (or overrun) forward, valued at today's budget lines.
            decimal carryOver = 0;
            var user = await db.Users.FindAsync(userId);
            if (user?.RolloverBudgets == true)
            {
                var prior = await db.Entries
                    .Where(e => e.UserId == userId && e.Date < start && e.Kind == EntryKind.Expense)
                    .Select(e => new { e.Date, e.Amount })
                    .ToListAsync();
                if (prior.Count > 0)
                {
                    var monthsTracked = prior.Select(e => (e.Date.Year, e.Date.Month)).Distinct().Count();
                    carryOver = budgetTotal * monthsTracked - prior.Sum(e => e.Amount);
                }
            }

            var today = DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
            var lastCounted = end.AddDays(-1) < today ? end.AddDays(-1) : today;
            var noSpendDays = 0;
            if (lastCounted >= start)
            {
                var daysWithSpend = expenses.Select(e => e.Date).ToHashSet();
                noSpendDays = Enumerable.Range(0, lastCounted.DayNumber - start.DayNumber + 1)
                    .Count(offset => !daysWithSpend.Contains(start.AddDays(offset)));
            }

            return Results.Ok(new MonthSummary(
                Month: month,
                BudgetTotal: budgetTotal,
                Spent: spent,
                Income: income,
                CarryOver: carryOver,
                LeftToSpend: budgetTotal + carryOver - spent,
                EntryCount: entries.Count,
                NoSpendDays: noSpendDays,
                Categories: categories
                    .Select(c => new CategorySummary(
                        c.Id, c.Name, c.Emoji, c.MonthlyBudget,
                        spentByCategory.GetValueOrDefault(c.Id), c.Group))
                    .ToList()));
        });

        // The long view: the year in months.
        group.MapGet("/year/{year:int}", async (int year, ClaimsPrincipal principal, AppDb db) =>
        {
            if (year is < 2000 or > 2100)
                return Results.BadRequest(new { error = "Year out of range." });

            var userId = principal.GetUserId();
            var start = new DateOnly(year, 1, 1);
            var end = start.AddYears(1);
            var entries = await db.Entries
                .Where(e => e.UserId == userId && e.Date >= start && e.Date < end)
                .Select(e => new { e.Date, e.Amount, e.Kind })
                .ToListAsync();
            var budgetTotal = await db.Categories
                .Where(c => c.UserId == userId)
                .Select(c => c.MonthlyBudget)
                .ToListAsync();

            var months = Enumerable.Range(1, 12).Select(m =>
            {
                var inMonth = entries.Where(e => e.Date.Month == m).ToList();
                return new MonthTotal(
                    $"{year}-{m:00}",
                    inMonth.Where(e => e.Kind == EntryKind.Expense).Sum(e => e.Amount),
                    inMonth.Where(e => e.Kind == EntryKind.Income).Sum(e => e.Amount));
            }).ToList();

            return Results.Ok(new YearSummary(year, budgetTotal.Sum(), months));
        });

        // The Sunday recap: this week against last week.
        group.MapGet("/review", async (ClaimsPrincipal principal, AppDb db, TimeProvider clock) =>
        {
            var userId = principal.GetUserId();
            var today = DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
            var weekStart = today.AddDays(-6);
            var lastWeekStart = today.AddDays(-13);

            var entries = await db.Entries
                .Include(e => e.Vendor)
                .Include(e => e.Category)
                .Where(e => e.UserId == userId && e.Date >= lastWeekStart && e.Date <= today
                            && e.Kind == EntryKind.Expense)
                .ToListAsync();

            var thisWeek = entries.Where(e => e.Date >= weekStart).ToList();
            var lastWeek = entries.Where(e => e.Date < weekStart).ToList();

            static WeekStats Stats(List<Entry> week) => new(
                week.Sum(e => e.Amount),
                week.Count,
                7 - week.Select(e => e.Date).Distinct().Count());

            var biggest = thisWeek.OrderByDescending(e => e.Amount).FirstOrDefault();
            var topCategory = thisWeek
                .Where(e => e.Category is not null)
                .GroupBy(e => e.Category!.Name)
                .OrderByDescending(g => g.Sum(e => e.Amount))
                .FirstOrDefault()?.Key;

            return Results.Ok(new ReviewSummary(
                From: weekStart.ToString("yyyy-MM-dd"),
                To: today.ToString("yyyy-MM-dd"),
                ThisWeek: Stats(thisWeek),
                LastWeek: Stats(lastWeek),
                BiggestEntry: biggest is null ? null : EntryResponse.From(biggest),
                TopCategory: topCategory));
        });

        // Patterns Ledger finds: same vendor, steady amount, regular interval.
        group.MapGet("/patterns", async (ClaimsPrincipal principal, AppDb db, TimeProvider clock) =>
        {
            var userId = principal.GetUserId();
            var today = DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
            var windowStart = today.AddDays(-90);

            var entries = await db.Entries
                .Include(e => e.Vendor)
                .Where(e => e.UserId == userId && e.VendorId != null && e.Date >= windowStart
                            && e.Kind == EntryKind.Expense)
                .ToListAsync();
            var existingRecurring = (await db.RecurringItems
                    .Where(r => r.UserId == userId)
                    .Select(r => r.Name)
                    .ToListAsync())
                .Select(n => n.ToLowerInvariant())
                .ToHashSet();

            var suggestions = new List<PatternSuggestion>();
            foreach (var group in entries.GroupBy(e => e.Vendor!.Name))
            {
                if (existingRecurring.Contains(group.Key.ToLowerInvariant())) continue;
                var ordered = group.OrderBy(e => e.Date).ToList();
                if (ordered.Count < 3) continue;

                var intervals = ordered.Zip(ordered.Skip(1), (a, b) => b.Date.DayNumber - a.Date.DayNumber)
                    .Where(d => d > 0)
                    .ToList();
                if (intervals.Count < 2) continue;

                var avgInterval = intervals.Average();
                if (avgInterval is < 5 or > 40) continue;
                // Steady interval: no gap straying more than 40% from the average.
                if (intervals.Any(i => Math.Abs(i - avgInterval) > avgInterval * 0.4)) continue;

                var avgAmount = ordered.Average(e => e.Amount);
                if (ordered.Any(e => Math.Abs(e.Amount - avgAmount) > avgAmount * 0.25m)) continue;

                suggestions.Add(new PatternSuggestion(
                    VendorName: group.Key,
                    CategoryId: ordered[^1].CategoryId,
                    Count: ordered.Count,
                    AverageAmount: Math.Round(avgAmount, 2),
                    IntervalDays: (int)Math.Round(avgInterval),
                    SuggestedCadence: avgInterval <= 10 ? Cadence.Weekly : Cadence.Monthly));
            }

            return Results.Ok(suggestions.OrderByDescending(s => s.Count).ToList());
        });

        return group;
    }
}
