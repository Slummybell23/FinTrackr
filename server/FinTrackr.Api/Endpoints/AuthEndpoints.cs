using System.Security.Claims;
using FinTrackr.Api.Data;
using FinTrackr.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FinTrackr.Api.Endpoints;

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuth(this RouteGroupBuilder group)
    {
        group.MapPost("/register", async (
            RegisterRequest request,
            UserManager<AppUser> users,
            SignInManager<AppUser> signIn,
            AppDb db) =>
        {
            var user = new AppUser
            {
                UserName = request.Email,
                Email = request.Email,
                // The first account on the instance gets the admin duties.
                IsAdmin = !await users.Users.AnyAsync(),
            };
            var result = await users.CreateAsync(user, request.Password);
            if (!result.Succeeded)
                return Results.BadRequest(new { errors = result.Errors.Select(e => e.Description) });

            await AppDb.SeedDefaultCategories(db, user.Id);
            await signIn.SignInAsync(user, isPersistent: true);
            return Results.Ok(ToResponse(user));
        });

        group.MapPost("/login", async (
            LoginRequest request,
            UserManager<AppUser> users,
            SignInManager<AppUser> signIn) =>
        {
            var user = await users.FindByEmailAsync(request.Email);
            if (user is null)
                return Results.Unauthorized();

            var result = await signIn.PasswordSignInAsync(
                user, request.Password, isPersistent: true, lockoutOnFailure: true);
            return result.Succeeded ? Results.Ok(ToResponse(user)) : Results.Unauthorized();
        });

        group.MapPost("/logout", async (SignInManager<AppUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        });

        group.MapGet("/me", async (ClaimsPrincipal principal, UserManager<AppUser> users) =>
            await FindUser(principal, users) is { } user
                ? Results.Ok(ToResponse(user))
                : Results.Unauthorized());

        group.MapPut("/settings", async (
            SettingsRequest request,
            ClaimsPrincipal principal,
            UserManager<AppUser> users) =>
        {
            if (await FindUser(principal, users) is not { } user)
                return Results.Unauthorized();
            if (request.Currency is { } currency)
            {
                if (currency.Length != 3 || !currency.All(char.IsAsciiLetterUpper))
                    return Results.BadRequest(new { error = "Currency must be a 3-letter ISO code like USD." });
                user.Currency = currency;
            }
            if (request.RolloverBudgets is { } rollover)
                user.RolloverBudgets = rollover;
            if (request.Theme is { } theme)
            {
                if (theme.Length > 1000)
                    return Results.BadRequest(new { error = "Theme payload is too large." });
                user.Theme = theme;
            }
            if (request.MonthlySavingsTarget is { } savingsTarget)
            {
                if (savingsTarget is < 0 or > Validation.MaxAmount)
                    return Results.BadRequest(new { error = "Savings target is out of range." });
                user.MonthlySavingsTarget = savingsTarget;
            }
            if (request.SavingsRateTarget is { } rateTarget)
            {
                if (rateTarget is < 0 or > 100)
                    return Results.BadRequest(new { error = "Savings rate target must be 0–100." });
                user.SavingsRateTarget = rateTarget;
            }
            if (request.OverspendNudge is { } nudge) user.OverspendNudge = nudge;
            if (request.Reflection is { } reflection) user.Reflection = reflection;
            if (request.Challenges is { } challenges) user.Challenges = challenges;

            await users.UpdateAsync(user);
            return Results.Ok(ToResponse(user));
        });

        group.MapPost("/change-password", async (
            ChangePasswordRequest request,
            ClaimsPrincipal principal,
            UserManager<AppUser> users,
            SignInManager<AppUser> signIn) =>
        {
            if (await FindUser(principal, users) is not { } user)
                return Results.Unauthorized();

            var result = await users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
            if (!result.Succeeded)
                return Results.BadRequest(new { errors = result.Errors.Select(e => e.Description) });

            await signIn.SignInAsync(user, isPersistent: true);
            return Results.NoContent();
        });

        // A fresh book: strike every entry, vendor, jar, and debt, re-seed the
        // starter lines, and keep the account (password, theme, settings).
        group.MapPost("/fresh-start", async (
            DeleteAccountRequest request,
            ClaimsPrincipal principal,
            UserManager<AppUser> users,
            AppDb db,
            IConfiguration config) =>
        {
            if (await FindUser(principal, users) is not { } user)
                return Results.Unauthorized();
            if (!await users.CheckPasswordAsync(user, request.Password))
                return Results.BadRequest(new { error = "Wrong password." });

            await DeleteUserData(db, user.Id);
            DeleteReceipts(config, user.Id);
            await AppDb.SeedDefaultCategories(db, user.Id);
            return Results.NoContent();
        });

        group.MapPost("/delete-account", async (
            DeleteAccountRequest request,
            ClaimsPrincipal principal,
            UserManager<AppUser> users,
            SignInManager<AppUser> signIn,
            AppDb db,
            IConfiguration config) =>
        {
            if (await FindUser(principal, users) is not { } user)
                return Results.Unauthorized();
            if (!await users.CheckPasswordAsync(user, request.Password))
                return Results.BadRequest(new { error = "Wrong password." });

            await DeleteUserData(db, user.Id);
            DeleteReceipts(config, user.Id);
            await signIn.SignOutAsync();
            await users.DeleteAsync(user);
            return Results.NoContent();
        });

        return group;
    }

    private static async Task DeleteUserData(AppDb db, string userId)
    {
        // Things that reference a Category (entries, recurring, challenges) go
        // before Categories themselves so the foreign keys never dangle.
        await db.Entries.Where(e => e.UserId == userId).ExecuteDeleteAsync();
        await db.RecurringItems.Where(r => r.UserId == userId).ExecuteDeleteAsync();
        await db.Challenges.Where(c => c.UserId == userId).ExecuteDeleteAsync();
        await db.Vendors.Where(v => v.UserId == userId).ExecuteDeleteAsync();
        await db.Categories.Where(c => c.UserId == userId).ExecuteDeleteAsync();
        await db.SavingsGoals.Where(g => g.UserId == userId).ExecuteDeleteAsync();
        await db.SavingsContributions.Where(c => c.UserId == userId).ExecuteDeleteAsync();
        await db.Debts.Where(d => d.UserId == userId).ExecuteDeleteAsync();
        await db.EntryTemplates.Where(t => t.UserId == userId).ExecuteDeleteAsync();
        await db.ImportProfiles.Where(p => p.UserId == userId).ExecuteDeleteAsync();
    }

    /// <summary>Receipt photos live under {root}/{userId}; strike the whole folder.</summary>
    private static void DeleteReceipts(IConfiguration config, string userId)
    {
        var folder = Path.Combine(config["ReceiptsPath"] ?? "receipts", userId);
        if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
    }

    private static AuthUserResponse ToResponse(AppUser user) =>
        new(user.Id, user.Email!, user.Currency, user.IsAdmin, user.RolloverBudgets, user.Theme,
            user.MonthlySavingsTarget, user.SavingsRateTarget,
            user.OverspendNudge, user.Reflection, user.Challenges);

    private static async Task<AppUser?> FindUser(ClaimsPrincipal principal, UserManager<AppUser> users)
    {
        var id = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return id is null ? null : await users.FindByIdAsync(id);
    }

    /// <summary>The signed-in user's id; endpoints behind RequireAuthorization always have one.</summary>
    public static string GetUserId(this ClaimsPrincipal principal) =>
        principal.FindFirst(ClaimTypes.NameIdentifier)?.Value
        ?? throw new InvalidOperationException("No authenticated user in context.");
}
