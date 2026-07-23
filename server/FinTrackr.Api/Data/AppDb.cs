using FinTrackr.Api.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Data;

public class AppDb(DbContextOptions<AppDb> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Vendor> Vendors => Set<Vendor>();
    public DbSet<Entry> Entries => Set<Entry>();
    public DbSet<RecurringItem> RecurringItems => Set<RecurringItem>();
    public DbSet<SavingsGoal> SavingsGoals => Set<SavingsGoal>();
    public DbSet<SavingsContribution> SavingsContributions => Set<SavingsContribution>();
    public DbSet<Debt> Debts => Set<Debt>();
    public DbSet<EntryTemplate> EntryTemplates => Set<EntryTemplate>();
    public DbSet<SpendingChallenge> Challenges => Set<SpendingChallenge>();
    public DbSet<ImportProfile> ImportProfiles => Set<ImportProfile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Category>()
            .HasIndex(c => c.UserId);

        modelBuilder.Entity<Vendor>()
            .HasIndex(v => new { v.UserId, v.Name })
            .IsUnique();

        modelBuilder.Entity<Entry>()
            .HasIndex(e => new { e.UserId, e.Date });

        modelBuilder.Entity<Entry>()
            .HasOne(e => e.Vendor)
            .WithMany()
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Entry>()
            .HasOne(e => e.Category)
            .WithMany()
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<RecurringItem>()
            .HasIndex(r => r.UserId);

        modelBuilder.Entity<RecurringItem>()
            .Property(r => r.Cadence)
            .HasConversion<string>();

        modelBuilder.Entity<Entry>()
            .Property(e => e.Kind)
            .HasConversion<string>();

        modelBuilder.Entity<SavingsGoal>()
            .HasIndex(g => g.UserId);

        modelBuilder.Entity<SavingsContribution>()
            .HasIndex(c => new { c.UserId, c.Date });

        modelBuilder.Entity<Debt>()
            .HasIndex(d => d.UserId);

        modelBuilder.Entity<Debt>()
            .Property(d => d.Kind)
            .HasConversion<string>();

        modelBuilder.Entity<Entry>()
            .HasOne(e => e.Debt)
            .WithMany()
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<EntryTemplate>()
            .HasIndex(t => t.UserId);

        modelBuilder.Entity<SpendingChallenge>()
            .HasIndex(c => c.UserId);

        modelBuilder.Entity<ImportProfile>()
            .HasIndex(p => new { p.UserId, p.Name })
            .IsUnique();

        modelBuilder.Entity<SpendingChallenge>()
            .Property(c => c.Kind)
            .HasConversion<string>();

        // Existing accounts get gentle overspend nudges on; new columns default off.
        modelBuilder.Entity<AppUser>()
            .Property(u => u.OverspendNudge)
            .HasDefaultValue(true);
    }

    /// <summary>Every new user starts with the design doc's default budget lines.</summary>
    public static async Task SeedDefaultCategories(AppDb db, string userId)
    {
        db.Categories.AddRange(
            new Category { UserId = userId, Name = "Groceries", Emoji = "🧺", MonthlyBudget = 500, SortOrder = 0 },
            new Category { UserId = userId, Name = "Dining", Emoji = "🍜", MonthlyBudget = 300, SortOrder = 1 },
            new Category { UserId = userId, Name = "Transport", Emoji = "🚋", MonthlyBudget = 150, SortOrder = 2 },
            new Category { UserId = userId, Name = "Home", Emoji = "🏠", MonthlyBudget = 200, SortOrder = 3 },
            new Category { UserId = userId, Name = "Health", Emoji = "🌿", MonthlyBudget = 100, SortOrder = 4 },
            new Category { UserId = userId, Name = "Fun", Emoji = "🎞️", MonthlyBudget = 150, SortOrder = 5 });
        await db.SaveChangesAsync();
    }
}
