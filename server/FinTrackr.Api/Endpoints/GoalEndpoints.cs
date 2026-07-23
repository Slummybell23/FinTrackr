using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class GoalEndpoints
{
    public static RouteGroupBuilder MapGoals(this RouteGroupBuilder group)
    {
        group.MapGet("/", (ClaimsPrincipal principal, AppDb db) =>
            db.SavingsGoals.Where(g => g.UserId == principal.GetUserId()).ToListAsync());

        group.MapPost("/", async (GoalRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var goal = new SavingsGoal
            {
                UserId = principal.GetUserId(),
                Name = request.Name,
                TargetAmount = request.TargetAmount,
                TargetDate = request.TargetDate,
            };
            db.SavingsGoals.Add(goal);
            await db.SaveChangesAsync();
            return Results.Created($"/api/goals/{goal.Id}", goal);
        });

        group.MapPut("/{id:int}", async (int id, GoalRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var goal = await db.SavingsGoals.FirstOrDefaultAsync(
                g => g.Id == id && g.UserId == principal.GetUserId());
            if (goal is null) return Results.NotFound();

            goal.Name = request.Name;
            goal.TargetAmount = request.TargetAmount;
            goal.TargetDate = request.TargetDate;
            await db.SaveChangesAsync();
            return Results.Ok(goal);
        });

        // How much was set aside (net of withdrawals) in a month — pay yourself first.
        group.MapGet("/set-aside/{month}", async (string month, ClaimsPrincipal principal, AppDb db) =>
        {
            if (!EntryEndpoints.TryParseMonth(month, out var start, out var end))
                return Results.BadRequest(new { error = "Month must look like 2026-07." });
            var amounts = await db.SavingsContributions
                .Where(c => c.UserId == principal.GetUserId() && c.Date >= start && c.Date < end)
                .Select(c => c.Amount)
                .ToListAsync();
            return Results.Ok(new { month, amount = amounts.Sum() });
        });

        // The jar you fill by hand: add (or withdraw, with a negative amount) savings.
        group.MapPost("/{id:int}/contribute", async (int id, GoalContribution contribution, ClaimsPrincipal principal, AppDb db, TimeProvider clock) =>
        {
            var userId = principal.GetUserId();
            var goal = await db.SavingsGoals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
            if (goal is null) return Results.NotFound();

            // Clamp the withdrawal so the jar never goes negative, then log what actually moved.
            var applied = Math.Max(0, goal.SavedAmount + contribution.Amount) - goal.SavedAmount;
            goal.SavedAmount += applied;
            if (applied != 0)
                db.SavingsContributions.Add(new SavingsContribution
                {
                    UserId = userId,
                    GoalId = goal.Id,
                    Amount = applied,
                    Date = DateOnly.FromDateTime(clock.GetLocalNow().DateTime),
                });
            await db.SaveChangesAsync();
            return Results.Ok(goal);
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var deleted = await db.SavingsGoals
                .Where(g => g.Id == id && g.UserId == principal.GetUserId())
                .ExecuteDeleteAsync();
            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        });

        return group;
    }
}
