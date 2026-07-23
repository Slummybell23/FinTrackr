using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class VendorEndpoints
{
    public static RouteGroupBuilder MapVendors(this RouteGroupBuilder group)
    {
        group.MapGet("/", (ClaimsPrincipal principal, AppDb db) =>
            db.Vendors
                .Where(v => v.UserId == principal.GetUserId())
                .Include(v => v.DefaultCategory)
                .OrderBy(v => v.Name)
                .ToListAsync());

        group.MapPost("/", async (VendorRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            if (Validation.Error(request) is { } error) return Results.BadRequest(new { error });
            var vendor = new Vendor
            {
                UserId = principal.GetUserId(),
                Name = request.Name,
                Alias = NormalizeAlias(request.Alias),
                DefaultCategoryId = request.DefaultCategoryId,
            };
            db.Vendors.Add(vendor);
            await db.SaveChangesAsync();
            return Results.Created($"/api/vendors/{vendor.Id}", vendor);
        });

        group.MapPut("/{id:int}", async (int id, VendorRequest request, ClaimsPrincipal principal, AppDb db) =>
        {
            var vendor = await db.Vendors.FirstOrDefaultAsync(
                v => v.Id == id && v.UserId == principal.GetUserId());
            if (vendor is null) return Results.NotFound();

            vendor.Name = request.Name;
            vendor.Alias = NormalizeAlias(request.Alias);
            vendor.DefaultCategoryId = request.DefaultCategoryId;
            await db.SaveChangesAsync();
            return Results.Ok(vendor);
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, AppDb db) =>
        {
            var deleted = await db.Vendors
                .Where(v => v.Id == id && v.UserId == principal.GetUserId())
                .ExecuteDeleteAsync();
            return deleted > 0 ? Results.NoContent() : Results.NotFound();
        });

        // Fold a duplicate vendor into another: entries move over, then the duplicate goes.
        group.MapPost("/{id:int}/merge/{targetId:int}", async (int id, int targetId, ClaimsPrincipal principal, AppDb db) =>
        {
            if (id == targetId) return Results.BadRequest(new { error = "A vendor can't merge into itself." });

            var userId = principal.GetUserId();
            var source = await db.Vendors.FirstOrDefaultAsync(v => v.Id == id && v.UserId == userId);
            var target = await db.Vendors.FirstOrDefaultAsync(v => v.Id == targetId && v.UserId == userId);
            if (source is null || target is null) return Results.NotFound();

            await db.Entries
                .Where(e => e.VendorId == source.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.VendorId, target.Id));
            target.DefaultCategoryId ??= source.DefaultCategoryId;
            db.Vendors.Remove(source);
            await db.SaveChangesAsync();
            return Results.Ok(target);
        });

        return group;
    }

    private static string? NormalizeAlias(string? alias) =>
        string.IsNullOrWhiteSpace(alias) ? null : alias.Trim();
}
