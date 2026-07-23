using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

/// <summary>Quick-add favorites: one tap on Home writes the entry.</summary>
public static class TemplateEndpoints
{
    public static RouteGroupBuilder MapTemplates(this RouteGroupBuilder group)
    {
        group.MapGet("/", (ClaimsPrincipal principal, AppDb db) =>
            db.EntryTemplates
                .Where(t => t.UserId == principal.GetUserId())
                .OrderBy(t => t.Name)
                .ToListAsync());

        group.MapPost("/", async (TemplateRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var userId = principal.GetUserId();
            if (request.CategoryId is not null
                && !await db.Categories.AnyAsync(c => c.Id == request.CategoryId && c.UserId == userId))
                return Results.BadRequest(new { error = "Unknown category." });

            var template = new EntryTemplate
            {
                UserId = userId,
                Name = request.Name,
                Amount = request.Amount,
                VendorName = string.IsNullOrWhiteSpace(request.VendorName) ? null : request.VendorName.Trim(),
                CategoryId = request.CategoryId,
            };
            db.EntryTemplates.Add(template);
            await db.SaveChangesAsync();
            return Results.Created($"/api/templates/{template.Id}", template);
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var deleted = await db.EntryTemplates
                .Where(t => t.Id == id && t.UserId == principal.GetUserId())
                .ExecuteDeleteAsync();
            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        });

        return group;
    }
}
