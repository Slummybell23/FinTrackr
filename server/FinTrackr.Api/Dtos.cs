using FinTrackr.Api.Models;

namespace FinTrackr.Api;

public record RegisterRequest(string Email, string Password);

public record LoginRequest(string Email, string Password);

public record AuthUserResponse(
    string Id, string Email, string Currency, bool IsAdmin, bool RolloverBudgets, string? Theme,
    decimal MonthlySavingsTarget, int SavingsRateTarget,
    bool OverspendNudge, bool Reflection, bool Challenges);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record DeleteAccountRequest(string Password);

public record SettingsRequest(
    string? Currency, bool? RolloverBudgets, string? Theme,
    decimal? MonthlySavingsTarget, int? SavingsRateTarget,
    bool? OverspendNudge, bool? Reflection, bool? Challenges);

public record CategoryRequest(
    string Name, string? Emoji, decimal MonthlyBudget, int SortOrder, string? Group = null);

public record VendorRequest(string Name, string? Alias, int? DefaultCategoryId);

public record EntryRequest(
    decimal Amount,
    DateOnly Date,
    string? VendorName,
    int? CategoryId,
    string? Note,
    EntryKind Kind = EntryKind.Expense,
    int? DebtId = null,
    IReadOnlyList<string>? Tags = null);

public record EntryResponse(
    int Id, decimal Amount, DateOnly Date, string? VendorName,
    int? CategoryId, string? CategoryName, string? Note, EntryKind Kind, bool HasReceipt,
    int? DebtId, string? DebtName, IReadOnlyList<string> Tags, string? Worth,
    int? VendorId, string? VendorAlias)
{
    public static EntryResponse From(Entry e) =>
        new(e.Id, e.Amount, e.Date, e.Vendor?.Name, e.CategoryId, e.Category?.Name, e.Note, e.Kind,
            e.ReceiptPath is not null, e.DebtId, e.Debt?.Name, EntryTags.Split(e.Tags), e.Worth,
            e.VendorId, e.Vendor?.Alias);
}

public record WorthRequest(string? Worth);

/// <summary>Free-form entry labels: normalized on the way in, listed on the way out.</summary>
public static class EntryTags
{
    public static IReadOnlyList<string> Split(string? stored) =>
        string.IsNullOrEmpty(stored) ? [] : stored.Split(',', StringSplitOptions.RemoveEmptyEntries);

    /// <summary>Trim, lowercase, hyphenate spaces, drop blanks and dupes; join with commas.</summary>
    public static string? Normalize(IReadOnlyList<string>? raw)
    {
        if (raw is null || raw.Count == 0) return null;
        var clean = raw
            .Select(t => string.Join('-', t.Trim().ToLowerInvariant().Split(
                (char[]?)null, StringSplitOptions.RemoveEmptyEntries)))
            .Where(t => t.Length > 0)
            .Distinct()
            .Take(20)
            .ToList();
        return clean.Count == 0 ? null : string.Join(',', clean);
    }
}

public record RecurringRequest(
    string Name, decimal Amount, Cadence Cadence, DateOnly NextDate, int? CategoryId,
    bool Variable = false);

public record RecordRequest(decimal Amount);

public record GoalRequest(string Name, decimal? TargetAmount, DateOnly? TargetDate = null);

/// <summary>One normalized statement row from the client's CSV mapping.</summary>
public record ImportRow(string Date, decimal Amount, string Kind, string Description);

public record ProposeRequest(List<ImportRow> Rows);

/// <summary>A statement row proposed against the book — matched, flagged, and
/// held for review; nothing is written until the user confirms.</summary>
public record ImportProposal(
    string Date,
    decimal Amount,
    string Kind,
    string RawDescription,
    string VendorName,
    int? CategoryId,
    string? CategoryName,
    bool Matched,
    bool Duplicate,
    bool Include);

public record ProposeResult(IReadOnlyList<ImportProposal> Proposals, IReadOnlyList<string> Warnings);

public record ImportProfileRequest(string Name, string Mapping);

public record ChallengeRequest(ChallengeKind Kind, decimal Target, int? CategoryId, string Month);

public record ChallengeResponse(
    int Id, ChallengeKind Kind, decimal Target, int? CategoryId, string? CategoryName,
    string Month, decimal Current, bool Done);

public record GoalContribution(decimal Amount);

public record DebtRequest(string Name, decimal StartingAmount, DebtKind Kind = DebtKind.ShortTerm);

public record TemplateRequest(string Name, decimal Amount, string? VendorName, int? CategoryId);

public record CategorySummary(
    int CategoryId, string Name, string? Emoji, decimal Budget, decimal Spent, string? Group = null);

public record MonthSummary(
    string Month,
    decimal BudgetTotal,
    decimal Spent,
    decimal Income,
    decimal CarryOver,
    decimal LeftToSpend,
    int EntryCount,
    int NoSpendDays,
    IReadOnlyList<CategorySummary> Categories);

public record MonthTotal(string Month, decimal Spent, decimal Income);

public record YearSummary(int Year, decimal BudgetTotal, IReadOnlyList<MonthTotal> Months);

public record WeekStats(decimal Spent, int EntryCount, int NoSpendDays);

public record ReviewSummary(
    string From,
    string To,
    WeekStats ThisWeek,
    WeekStats LastWeek,
    EntryResponse? BiggestEntry,
    string? TopCategory);

public record PatternSuggestion(
    string VendorName,
    int? CategoryId,
    int Count,
    decimal AverageAmount,
    int IntervalDays,
    Cadence SuggestedCadence);

/// <summary>Shared request sanity checks; null means valid.</summary>
public static class Validation
{
    public const decimal MaxAmount = 1_000_000m;

    public static string? AmountError(decimal amount) =>
        amount is <= 0 or > MaxAmount ? $"Amount must be between 0 and {MaxAmount:N0}." : null;

    public static string? NameError(string name, string label = "Name") =>
        string.IsNullOrWhiteSpace(name) ? $"{label} is required."
        : name.Length > 100 ? $"{label} must be 100 characters or fewer."
        : null;

    public static string? Error(EntryRequest r) =>
        AmountError(r.Amount)
        ?? (r.VendorName?.Length > 100 ? "Vendor must be 100 characters or fewer." : null)
        ?? (r.Note?.Length > 500 ? "Note must be 500 characters or fewer." : null)
        ?? (r.Tags?.Any(t => t.Length > 40) == true ? "A tag must be 40 characters or fewer." : null);

    public static string? Error(CategoryRequest r) =>
        NameError(r.Name)
        ?? (r.MonthlyBudget is < 0 or > MaxAmount ? "Budget must be between 0 and 1,000,000." : null)
        ?? (r.Emoji?.Length > 16 ? "Emoji must be short." : null)
        ?? (r.Group?.Length > 50 ? "Group must be 50 characters or fewer." : null);

    public static string? Error(VendorRequest r) =>
        NameError(r.Name)
        ?? (r.Alias?.Length > 100 ? "Alias must be 100 characters or fewer." : null);

    public static string? Error(DebtRequest r) => NameError(r.Name) ?? AmountError(r.StartingAmount);

    public static string? Error(TemplateRequest r) =>
        NameError(r.Name)
        ?? AmountError(r.Amount)
        ?? (r.VendorName?.Length > 100 ? "Vendor must be 100 characters or fewer." : null);

    public static string? Error(RecurringRequest r) => NameError(r.Name) ?? AmountError(r.Amount);

    // A target is optional (a plain savings category has none); if given, it must be sane.
    public static string? Error(GoalRequest r) =>
        NameError(r.Name) ?? (r.TargetAmount is { } target ? AmountError(target) : null);
}
