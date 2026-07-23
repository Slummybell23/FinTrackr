using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

/// <summary>
/// Instance administration, restricted to the first-registered (admin) account.
/// The SQLite file holds every user's ledger, so whole-database export and
/// restore are never exposed to regular accounts.
/// </summary>
public static class AdminEndpoints
{
    public static RouteGroupBuilder MapAdmin(this RouteGroupBuilder group)
    {
        group.MapPost("/backup", async (ClaimsPrincipal principal, AppDb db, IConfiguration config, TimeProvider clock) =>
        {
            if (!await IsAdmin(principal, db)) return Results.Forbid();

            var name = $"fintrackr-{clock.GetLocalNow():yyyy-MM-dd-HHmmss}.db";
            DatabaseMaintenance.Snapshot(config, Path.Combine(DatabaseMaintenance.BackupsRoot(config), name));
            return Results.Ok(new { file = name });
        });

        group.MapGet("/backups", async (ClaimsPrincipal principal, AppDb db, IConfiguration config) =>
        {
            if (!await IsAdmin(principal, db)) return Results.Forbid();

            var root = DatabaseMaintenance.BackupsRoot(config);
            var files = Directory.Exists(root)
                ? Directory.GetFiles(root, "fintrackr-*.db")
                    .Select(Path.GetFileName)
                    .OrderByDescending(f => f)
                    .ToList()
                : [];
            return Results.Ok(files);
        });

        // Download the whole database as a consistent snapshot.
        group.MapGet("/database", async (ClaimsPrincipal principal, AppDb db, IConfiguration config) =>
        {
            if (!await IsAdmin(principal, db)) return Results.Forbid();

            var temp = Path.Combine(Path.GetTempPath(), $"fintrackr-export-{Guid.NewGuid():N}.db");
            DatabaseMaintenance.Snapshot(config, temp);
            var stream = new FileStream(
                temp, FileMode.Open, FileAccess.Read, FileShare.None, 64 * 1024,
                FileOptions.DeleteOnClose);
            return Results.File(stream, "application/vnd.sqlite3", "fintrackr.db");
        });

        // Replace the live database with an uploaded snapshot. A safety copy of
        // the current database is written to the backups folder first.
        group.MapPost("/database", async (
                IFormFile file, ClaimsPrincipal principal, AppDb db, IConfiguration config, TimeProvider clock,
                IServiceScopeFactory scopeFactory) =>
            {
                if (!await IsAdmin(principal, db)) return Results.Forbid();
                if (file.Length is 0 or > 2L * 1024 * 1024 * 1024)
                    return Results.BadRequest(new { error = "That doesn't look like a database file." });

                var temp = Path.Combine(Path.GetTempPath(), $"fintrackr-restore-{Guid.NewGuid():N}.db");
                try
                {
                    await using (var stream = File.Create(temp))
                        await file.CopyToAsync(stream);

                    if (!DatabaseMaintenance.LooksLikeOurDatabase(temp))
                        return Results.BadRequest(new { error = "Not a finTrackr database file." });

                    DatabaseMaintenance.Snapshot(config, Path.Combine(
                        DatabaseMaintenance.BackupsRoot(config),
                        $"fintrackr-pre-restore-{clock.GetLocalNow():yyyy-MM-dd-HHmmss}.db"));
                    DatabaseMaintenance.Restore(config, temp);

                    // Bring an older snapshot up to the current schema.
                    using var scope = scopeFactory.CreateScope();
                    var freshDb = scope.ServiceProvider.GetRequiredService<AppDb>();
                    freshDb.Database.Migrate();
                    freshDb.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");

                    return Results.Ok(new { restored = true });
                }
                finally
                {
                    if (File.Exists(temp)) File.Delete(temp);
                }
            })
            .DisableAntiforgery();

        return group;
    }

    private static async Task<bool> IsAdmin(ClaimsPrincipal principal, AppDb db)
    {
        var user = await db.Users.FindAsync(principal.GetUserId());
        return user is { IsAdmin: true };
    }
}
