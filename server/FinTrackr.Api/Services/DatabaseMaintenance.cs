using Microsoft.Data.Sqlite;

namespace FinTrackr.Api.Services;

/// <summary>Snapshot and restore helpers shared by the admin endpoints and nightly backups.</summary>
public static class DatabaseMaintenance
{
    public static string DbPath(IConfiguration config) =>
        new SqliteConnectionStringBuilder(config.GetConnectionString("Default")).DataSource;

    public static string BackupsRoot(IConfiguration config) => config["BackupsPath"] ?? "backups";

    /// <summary>VACUUM INTO writes a consistent snapshot even while the app is serving.</summary>
    public static void Snapshot(IConfiguration config, string targetPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(targetPath))!);
        if (File.Exists(targetPath)) File.Delete(targetPath);

        using var connection = new SqliteConnection($"Data Source={DbPath(config)}");
        connection.Open();
        using var command = connection.CreateCommand();
        // Paths come from configuration, never from request input.
        command.CommandText = $"VACUUM INTO '{targetPath.Replace("'", "''")}'";
        command.ExecuteNonQuery();
    }

    /// <summary>True when the file is a SQLite database containing our core tables.</summary>
    public static bool LooksLikeOurDatabase(string path)
    {
        try
        {
            using (var stream = File.OpenRead(path))
            {
                var header = new byte[16];
                if (stream.Read(header, 0, 16) < 16) return false;
                if (!System.Text.Encoding.ASCII.GetString(header).StartsWith("SQLite format 3")) return false;
            }

            using var connection = new SqliteConnection($"Data Source={path};Mode=ReadOnly");
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('AspNetUsers', 'Entries', 'Categories')";
            return Convert.ToInt32(command.ExecuteScalar()) == 3;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Swap the live database for the uploaded file; pooled connections are dropped first.</summary>
    public static void Restore(IConfiguration config, string uploadedPath)
    {
        var dbPath = DbPath(config);
        SqliteConnection.ClearAllPools();
        File.Copy(uploadedPath, dbPath, overwrite: true);
        foreach (var suffix in new[] { "-wal", "-shm" })
            if (File.Exists(dbPath + suffix))
                File.Delete(dbPath + suffix);
    }
}

/// <summary>Writes a dated snapshot every day and keeps the newest seven.</summary>
public class NightlyBackup(
    IConfiguration config,
    TimeProvider clock,
    ILogger<NightlyBackup> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var root = DatabaseMaintenance.BackupsRoot(config);
                var name = $"fintrackr-{clock.GetLocalNow():yyyy-MM-dd}.db";
                var target = Path.Combine(root, name);
                if (!File.Exists(target))
                {
                    DatabaseMaintenance.Snapshot(config, target);
                    foreach (var stale in Directory.GetFiles(root, "fintrackr-*.db")
                                 .OrderByDescending(f => f)
                                 .Skip(7))
                        File.Delete(stale);
                    logger.LogInformation("Nightly backup written: {Name}", name);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Nightly backup failed.");
            }

            await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
        }
    }
}
