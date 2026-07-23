using System.Security.Claims;
using FinTrackr.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class ReceiptEndpoints
{
    private const long MaxBytes = 10 * 1024 * 1024;

    private static readonly Dictionary<string, string> ExtensionsByType = new()
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp",
        ["image/heic"] = ".heic",
    };

    /// <summary>Adds receipt photo routes onto the /api/entries group.</summary>
    public static RouteGroupBuilder MapReceipts(this RouteGroupBuilder group)
    {
        // Cookie-authed SPA: CSRF is covered by SameSite, matching the JSON endpoints.
        group.MapPost("/{id:int}/receipt", async (
                int id, IFormFile file, ClaimsPrincipal principal, AppDb db, IConfiguration config) =>
            {
                if (file.Length is 0 or > MaxBytes)
                    return Results.BadRequest(new { error = "Receipts are capped at 10 MB." });
                if (!ExtensionsByType.TryGetValue(file.ContentType, out var extension))
                    return Results.BadRequest(new { error = "Use a JPEG, PNG, WebP, or HEIC image." });

                var userId = principal.GetUserId();
                var entry = await db.Entries.FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId);
                if (entry is null) return Results.NotFound();

                var root = ReceiptsRoot(config);
                Directory.CreateDirectory(Path.Combine(root, userId));
                var relativePath = Path.Combine(userId, $"{entry.Id}{extension}");

                DeleteFile(root, entry.ReceiptPath);
                await using (var stream = File.Create(Path.Combine(root, relativePath)))
                    await file.CopyToAsync(stream);

                entry.ReceiptPath = relativePath;
                await db.SaveChangesAsync();
                return Results.Ok(new { hasReceipt = true });
            })
            .DisableAntiforgery();

        group.MapGet("/{id:int}/receipt", async (
            int id, ClaimsPrincipal principal, AppDb db, IConfiguration config) =>
        {
            var entry = await db.Entries.FirstOrDefaultAsync(
                e => e.Id == id && e.UserId == principal.GetUserId());
            if (entry?.ReceiptPath is null) return Results.NotFound();

            var fullPath = Path.Combine(ReceiptsRoot(config), entry.ReceiptPath);
            if (!File.Exists(fullPath)) return Results.NotFound();

            var contentType = ExtensionsByType
                .FirstOrDefault(p => p.Value == Path.GetExtension(fullPath)).Key ?? "image/jpeg";
            // Results.File requires an absolute path for physical files.
            return Results.File(Path.GetFullPath(fullPath), contentType);
        });

        group.MapDelete("/{id:int}/receipt", async (
            int id, ClaimsPrincipal principal, AppDb db, IConfiguration config) =>
        {
            var entry = await db.Entries.FirstOrDefaultAsync(
                e => e.Id == id && e.UserId == principal.GetUserId());
            if (entry is null) return Results.NotFound();

            DeleteFile(ReceiptsRoot(config), entry.ReceiptPath);
            entry.ReceiptPath = null;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        return group;
    }

    private static string ReceiptsRoot(IConfiguration config) => config["ReceiptsPath"] ?? "receipts";

    private static void DeleteFile(string root, string? relativePath)
    {
        if (relativePath is null) return;
        var fullPath = Path.Combine(root, relativePath);
        if (File.Exists(fullPath)) File.Delete(fullPath);
    }
}
