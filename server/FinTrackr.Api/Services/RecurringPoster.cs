using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Services;

/// <summary>
/// Makes "everything that leaves on its own" true: due recurring items are
/// posted to the ledger as entries and their next date advances. Runs at
/// startup and then hourly, so a container that slept through a due date
/// catches up as soon as it wakes.
/// </summary>
public class RecurringPoster(
    IServiceScopeFactory scopeFactory,
    TimeProvider clock,
    ILogger<RecurringPoster> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var posted = await PostDueItems(stoppingToken);
                if (posted > 0)
                    logger.LogInformation("Posted {Count} recurring entries.", posted);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Failed to post recurring entries.");
            }

            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }
    }

    private async Task<int> PostDueItems(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDb>();
        var today = DateOnly.FromDateTime(clock.GetLocalNow().DateTime);

        // Variable bills (utilities) wait to be recorded by hand — never auto-posted.
        var due = await db.RecurringItems.Where(r => r.NextDate <= today && !r.Variable).ToListAsync(ct);
        var posted = 0;
        foreach (var item in due)
        {
            while (item.NextDate <= today)
            {
                db.Entries.Add(new Entry
                {
                    UserId = item.UserId,
                    Amount = item.Amount,
                    Date = item.NextDate,
                    CategoryId = item.CategoryId,
                    Note = item.Name,
                    Kind = EntryKind.Expense,
                });
                item.NextDate = Advance(item.NextDate, item.Cadence);
                posted++;
            }
        }

        await db.SaveChangesAsync(ct);
        return posted;
    }

    internal static DateOnly Advance(DateOnly date, Cadence cadence) => cadence switch
    {
        Cadence.Weekly => date.AddDays(7),
        Cadence.Yearly => date.AddYears(1),
        _ => date.AddMonths(1),
    };
}
