using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using FinTrackr.Api.Data;
using FinTrackr.Api.Endpoints;
using FinTrackr.Api.Models;
using FinTrackr.Api.Services;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDb>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHostedService<RecurringPoster>();
builder.Services.AddHostedService<NightlyBackup>();

// Behind a reverse proxy (TLS on Unraid etc.), honor the forwarded scheme and
// client IP so Secure cookies and the auth rate limiter both work correctly.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();

// Credential endpoints are throttled per client IP on top of Identity's lockout.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Configuration.GetValue("RateLimiting:AuthPermitLimit", 10),
            Window = TimeSpan.FromMinutes(1),
        }));
});

builder.Services
    .AddIdentityCore<AppUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 8;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.Password.RequireLowercase = false;
        options.Password.RequireDigit = false;
    })
    .AddEntityFrameworkStores<AppDb>()
    .AddSignInManager();

builder.Services
    .AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddIdentityCookies();
builder.Services.AddAuthorization();

// An API client wants a 401, never a redirect to a login page.
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "fintrackr.auth";
    options.ExpireTimeSpan = TimeSpan.FromDays(30);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    };
});

// The Vite dev server proxies /api, but allow direct calls from it too.
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins("http://localhost:5173")
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.Migrate();
    // WAL lets readers keep going while a write is in flight.
    db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors();
}

app.UseForwardedHeaders();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

var api = app.MapGroup("/api");
api.MapGet("/health", () => new
{
    status = "ok",
    version = typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "dev",
});
api.MapGroup("/auth").MapAuth().RequireRateLimiting("auth");
api.MapGroup("/categories").MapCategories().RequireAuthorization();
api.MapGroup("/vendors").MapVendors().RequireAuthorization();
api.MapGroup("/entries").MapEntries().MapReceipts().RequireAuthorization();
api.MapGroup("/recurring").MapRecurring().RequireAuthorization();
api.MapGroup("/goals").MapGoals().RequireAuthorization();
api.MapGroup("/debts").MapDebts().RequireAuthorization();
api.MapGroup("/challenges").MapChallenges().RequireAuthorization();
api.MapGroup("/templates").MapTemplates().RequireAuthorization();
api.MapGroup("/summary").MapSummary().RequireAuthorization();
api.MapGroup("/csv").MapCsv().RequireAuthorization();
api.MapGroup("/export").MapExport().RequireAuthorization();
api.MapGroup("/import").MapImport().RequireAuthorization();
api.MapGroup("/admin").MapAdmin().RequireAuthorization();

// In the Docker image the built PWA lives in wwwroot; serve it and let the
// client router own any non-API path.
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();

// Exposes the entry point to WebApplicationFactory in the test project.
public partial class Program;
