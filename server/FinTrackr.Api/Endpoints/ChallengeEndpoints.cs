using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class ChallengeEndpoints
{
    public static RouteGroupBuilder MapChallenges(this RouteGroupBuilder group)
    {
        // Each challenge carries its live progress, read from the month's ledger.
        group.MapGet("/", async (ClaimsPrincipal principal, AppDb db, TimeProvider clock) =>
        {
            var userId = principal.GetUserId();
            var challenges = await db.Challenges
                .Where(c => c.UserId == userId)
                .Include(c => c.Category)
                .OrderByDescending(c => c.Month)
                .ToListAsync();
            if (challenges.Count == 0) return Results.Ok(Array.Empty<ChallengeResponse>());

            var months = challenges.Select(c => c.Month).Distinct().ToList();
            var today = DateOnly.FromDateTime(clock.GetLocalNow().DateTime);

            var responses = new List<ChallengeResponse>();
            foreach (var challenge in challenges)
            {
                if (!EntryEndpoints.TryParseMonth(challenge.Month, out var start, out var end))
                    continue;

                var expenses = await db.Entries
                    .Where(e => e.UserId == userId && e.Kind == EntryKind.Expense
                                && e.Date >= start && e.Date < end)
                    .Select(e => new { e.Date, e.Amount, e.CategoryId })
                    .ToListAsync();

                decimal current;
                bool done;
                switch (challenge.Kind)
                {
                    case ChallengeKind.NoSpendDays:
                        var lastDay = end.AddDays(-1) < today ? end.AddDays(-1) : today;
                        var spentDays = expenses.Select(e => e.Date).ToHashSet();
                        current = start > lastDay ? 0 : Enumerable
                            .Range(0, lastDay.DayNumber - start.DayNumber + 1)
                            .Count(offset => !spentDays.Contains(start.AddDays(offset)));
                        done = current >= challenge.Target;
                        break;
                    case ChallengeKind.CategoryUnder:
                        current = expenses.Where(e => e.CategoryId == challenge.CategoryId).Sum(e => e.Amount);
                        done = current <= challenge.Target;
                        break;
                    default: // TotalUnder
                        current = expenses.Sum(e => e.Amount);
                        done = current <= challenge.Target;
                        break;
                }

                responses.Add(new ChallengeResponse(
                    challenge.Id, challenge.Kind, challenge.Target, challenge.CategoryId,
                    challenge.Category?.Name, challenge.Month, current, done));
            }

            return Results.Ok(responses);
        });

        group.MapPost("/", async (ChallengeRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (!EntryEndpoints.TryParseMonth(request.Month, out _, out _))
                return Results.BadRequest(new { error = "Month must look like 2026-07." });
            if (request.Target is < 0 or > Validation.MaxAmount)
                return Results.BadRequest(new { error = "Target is out of range." });

            var userId = principal.GetUserId();
            if (request.Kind == ChallengeKind.CategoryUnder)
            {
                if (request.CategoryId is null ||
                    !await db.Categories.AnyAsync(c => c.Id == request.CategoryId && c.UserId == userId))
                    return Results.BadRequest(new { error = "Pick a line for this challenge." });
            }

            var challenge = new SpendingChallenge
            {
                UserId = userId,
                Kind = request.Kind,
                Target = request.Target,
                CategoryId = request.Kind == ChallengeKind.CategoryUnder ? request.CategoryId : null,
                Month = request.Month,
            };
            db.Challenges.Add(challenge);
            await db.SaveChangesAsync();
            return Results.Created($"/api/challenges/{challenge.Id}", new { challenge.Id });
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var deleted = await db.Challenges
                .Where(c => c.Id == id && c.UserId == principal.GetUserId())
                .ExecuteDeleteAsync();
            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        });

        return group;
    }
}
