using Microsoft.AspNetCore.Identity;

namespace FinTrackr.Api.Models;

public class AppUser : IdentityUser
{
    public string Currency { get; set; } = "USD";

    // The first registered account administers the instance (backups, restore).
    public bool IsAdmin { get; set; }

    // Envelope-style budgeting: unspent budget carries into the next month.
    public bool RolloverBudgets { get; set; }

    // The chosen paper & ink, synced across devices. Opaque JSON owned by the client.
    public string? Theme { get; set; }

    // Pay yourself first: the amount to move into savings each month (0 = unset).
    public decimal MonthlySavingsTarget { get; set; }

    // The share of income to keep, as a percent (0 = unset).
    public int SavingsRateTarget { get; set; }

    // Coaching, kept opt-in so a plain ledger stays plain. Nudges are on by
    // default (gentle); the reflection ritual and challenges start off.
    public bool OverspendNudge { get; set; } = true;
    public bool Reflection { get; set; }
    public bool Challenges { get; set; }
}

public enum EntryKind
{
    Expense,
    Income,
}

public class Category
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Emoji { get; set; }
    public decimal MonthlyBudget { get; set; }
    public int SortOrder { get; set; }

    // An optional bucket the line belongs to — "Needs", "Wants", "Fixed" — so
    // Budgets and Insights can roll lines up. Null means ungrouped.
    public string? Group { get; set; }
}

public class Vendor
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Name { get; set; } = "";

    // A second name the vendor answers to when entries are filed
    // (e.g. the statement string "AMZN Mktp US" aliasing "Amazon").
    public string? Alias { get; set; }
    public int? DefaultCategoryId { get; set; }
    public Category? DefaultCategory { get; set; }
}

public class Entry
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; }
    public int? VendorId { get; set; }
    public Vendor? Vendor { get; set; }
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }
    public string? Note { get; set; }
    public EntryKind Kind { get; set; } = EntryKind.Expense;
    public string? ReceiptPath { get; set; }

    // Free-form labels, normalized and comma-joined (e.g. "kyoto-trip,gift").
    // Cross-cutting: a tag spans categories where the category can't.
    public string? Tags { get; set; }

    // The worth-it verdict: "Worth" or "Regret", or null if not weighed.
    public string? Worth { get; set; }

    // When set, this entry pays down the linked debt.
    public int? DebtId { get; set; }
    public Debt? Debt { get; set; }
}

/// <summary>A bank's CSV shape, remembered — so next month's statement import
/// is pick-the-profile and done. The mapping is opaque JSON owned by the client.</summary>
public class ImportProfile
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Mapping { get; set; } = "";
}

/// <summary>A one-tap favorite for the things you log daily.</summary>
public class EntryTemplate
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Amount { get; set; }
    public string? VendorName { get; set; }
    public int? CategoryId { get; set; }
}

public enum Cadence
{
    Weekly,
    Monthly,
    Yearly,
}

public class RecurringItem
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Amount { get; set; }
    public Cadence Cadence { get; set; }
    public DateOnly NextDate { get; set; }
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }

    // The last amount before this one, and when it changed — so a price
    // creeping up (streaming, insurance) can be surfaced, not just absorbed.
    public decimal? PreviousAmount { get; set; }
    public DateOnly? AmountChangedAt { get; set; }

    // A utility bill and the like: the amount varies month to month, so it
    // isn't posted automatically. The amount is a typical estimate; when due,
    // you record the real figure by hand and its next date advances.
    public bool Variable { get; set; }
}

/// <summary>One hand-made contribution to (or withdrawal from) a jar, dated —
/// so "pay yourself first" can read how much was set aside this month.</summary>
public class SavingsContribution
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public int GoalId { get; set; }
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; }
}

public class SavingsGoal
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Name { get; set; } = "";

    // Null means a plain savings category — a bucket with no goal to reach,
    // just a share of what you've set aside. A value is a jar to fill toward.
    public decimal? TargetAmount { get; set; }
    public decimal SavedAmount { get; set; }

    // A sinking fund: the date to have the target by, so the app can pace it
    // ("$85 a month to be ready by December"). Null for an open-ended jar.
    public DateOnly? TargetDate { get; set; }
}

public enum DebtKind
{
    // The crawl out: cards and store credit you want gone.
    ShortTerm,

    // The long road: car loans, student loans — scheduled, expected.
    LongTerm,
}

/// <summary>A balance owed (Discover, Best Buy…) paid down by hand over time.</summary>
public class Debt
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal StartingAmount { get; set; }
    public decimal PaidAmount { get; set; }
    public DebtKind Kind { get; set; } = DebtKind.ShortTerm;
}

public enum ChallengeKind
{
    // Reach at least N no-spend days this month.
    NoSpendDays,

    // Keep a category's spend under a cap this month.
    CategoryUnder,

    // Keep the whole month's spend under a cap.
    TotalUnder,
}

/// <summary>A chosen goal for the month — a nudge with teeth, opt-in.</summary>
public class SpendingChallenge
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public ChallengeKind Kind { get; set; }
    public decimal Target { get; set; }
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }

    // The month it runs, "yyyy-MM".
    public string Month { get; set; } = "";
}
