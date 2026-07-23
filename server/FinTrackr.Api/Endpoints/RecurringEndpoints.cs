using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using FinTrackr.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class RecurringEndpoints
{
    public static RouteGroupBuilder MapRecurring(this RouteGroupBuilder group)
    {
        group.MapGet("/", (ClaimsPrincipal principal, AppDb db) =>
            db.RecurringItems
                .Where(r => r.UserId == principal.GetUserId())
                .Include(r => r.Category)
                .OrderBy(r => r.NextDate)
                .ToListAsync());

        group.MapPost("/", async (RecurringRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var item = new RecurringItem
            {
                UserId = principal.GetUserId(),
                Name = request.Name,
                Amount = request.Amount,
                Cadence = request.Cadence,
                NextDate = request.NextDate,
                CategoryId = request.CategoryId,
                Variable = request.Variable,
            };
            db.RecurringItems.Add(item);
            await db.SaveChangesAsync();
            return Results.Created($"/api/recurring/{item.Id}", item);
        });

        group.MapPut("/{id:int}", async (int id, RecurringRequest request, ClaimsPrincipal principal, AppDb db, TimeProvider clock) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var item = await db.RecurringItems.FirstOrDefaultAsync(
                r => r.Id == id && r.UserId == principal.GetUserId());
            if (item is null) return Results.NotFound();

            // Remember the old price when it moves, so creep can be surfaced.
            if (request.Amount != item.Amount)
            {
                item.PreviousAmount = item.Amount;
                item.AmountChangedAt = DateOnly.FromDateTime(clock.GetLocalNow().DateTime);
            }
            item.Name = request.Name;
            item.Amount = request.Amount;
            item.Cadence = request.Cadence;
            item.NextDate = request.NextDate;
            item.CategoryId = request.CategoryId;
            item.Variable = request.Variable;
            await db.SaveChangesAsync();
            return Results.Ok(item);
        });

        // Record a variable bill's real amount by hand: files the entry and
        // rolls the item forward to its next due date.
        group.MapPost("/{id:int}/record", async (int id, RecordRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.AmountError(request.Amount) is { } error)
                return Results.BadRequest(new { error });
            var item = await db.RecurringItems.FirstOrDefaultAsync(
                r => r.Id == id && r.UserId == principal.GetUserId());
            if (item is null) return Results.NotFound();

            db.Entries.Add(new Entry
            {
                UserId = item.UserId,
                Amount = request.Amount,
                Date = item.NextDate,
                CategoryId = item.CategoryId,
                Note = item.Name,
                Kind = EntryKind.Expense,
            });
            item.NextDate = RecurringPoster.Advance(item.NextDate, item.Cadence);
            await db.SaveChangesAsync();
            return Results.Ok(item);
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var deleted = await db.RecurringItems
                .Where(r => r.Id == id && r.UserId == principal.GetUserId())
                .ExecuteDeleteAsync();
            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        });

        return group;
    }
}
