using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class CategoryEndpoints
{
    public static RouteGroupBuilder MapCategories(this RouteGroupBuilder group)
    {
        group.MapGet("/", (ClaimsPrincipal principal, AppDb db) =>
            db.Categories
                .Where(c => c.UserId == principal.GetUserId())
                .OrderBy(c => c.SortOrder)
                .ToListAsync());

        group.MapGet("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
            await db.Categories.FirstOrDefaultAsync(
                c => c.Id == id && c.UserId == principal.GetUserId()) is { } category
                ? Results.Ok(category)
                : Results.NotFound());

        group.MapPost("/", async (CategoryRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var category = new Category
            {
                UserId = principal.GetUserId(),
                Name = request.Name,
                Emoji = request.Emoji,
                MonthlyBudget = request.MonthlyBudget,
                SortOrder = request.SortOrder,
                Group = NormalizeGroup(request.Group),
            };
            db.Categories.Add(category);
            await db.SaveChangesAsync();
            return Results.Created($"/api/categories/{category.Id}", category);
        });

        group.MapPut("/{id:int}", async (int id, CategoryRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var category = await db.Categories.FirstOrDefaultAsync(
                c => c.Id == id && c.UserId == principal.GetUserId());
            if (category is null) return Results.NotFound();

            category.Name = request.Name;
            category.Emoji = request.Emoji;
            category.MonthlyBudget = request.MonthlyBudget;
            category.SortOrder = request.SortOrder;
            category.Group = NormalizeGroup(request.Group);
            await db.SaveChangesAsync();
            return Results.Ok(category);
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var deleted = await db.Categories
                .Where(c => c.Id == id && c.UserId == principal.GetUserId())
                .ExecuteDeleteAsync();
            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        });

        return group;
    }

    private static string? NormalizeGroup(string? group)
    {
        var trimmed = group?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
