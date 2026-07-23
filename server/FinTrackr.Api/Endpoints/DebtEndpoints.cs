using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class DebtEndpoints
{
    public static RouteGroupBuilder MapDebts(this RouteGroupBuilder group)
    {
        group.MapGet("/", (ClaimsPrincipal principal, AppDb db) =>
            db.Debts.Where(d => d.UserId == principal.GetUserId()).ToListAsync());

        group.MapPost("/", async (DebtRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var debt = new Debt
            {
                UserId = principal.GetUserId(),
                Name = request.Name,
                StartingAmount = request.StartingAmount,
                Kind = request.Kind,
            };
            db.Debts.Add(debt);
            await db.SaveChangesAsync();
            return Results.Created($"/api/debts/{debt.Id}", debt);
        });

        // Rename, or restate the balance when interest grows it.
        group.MapPut("/{id:int}", async (int id, DebtRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var debt = await db.Debts.FirstOrDefaultAsync(
                d => d.Id == id && d.UserId == principal.GetUserId());
            if (debt is null) return Results.NotFound();

            debt.Name = request.Name;
            debt.StartingAmount = request.StartingAmount;
            debt.Kind = request.Kind;
            debt.PaidAmount = Math.Min(debt.PaidAmount, debt.StartingAmount);
            await db.SaveChangesAsync();
            return Results.Ok(debt);
        });

        // The crawl out: payments raise PaidAmount (negative amounts undo one).
        group.MapPost("/{id:int}/pay", async (int id, GoalContribution payment, ClaimsPrincipal principal, AppDb db) =>
        {
            var debt = await db.Debts.FirstOrDefaultAsync(
                d => d.Id == id && d.UserId == principal.GetUserId());
            if (debt is null) return Results.NotFound();

            debt.PaidAmount = Math.Clamp(debt.PaidAmount + payment.Amount, 0, debt.StartingAmount);
            await db.SaveChangesAsync();
            return Results.Ok(debt);
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var deleted = await db.Debts
                .Where(d => d.Id == id && d.UserId == principal.GetUserId())
                .ExecuteDeleteAsync();
            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        });

        return group;
    }
}
