using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FinTrackr.Api.Tests;

/// <summary>One factory (and SQLite file) per test class run; clients share cookies per user.</summary>
public sealed class ApiFixture : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"fintrackr-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbPath}");
        builder.UseSetting("ReceiptsPath", Path.Combine(Path.GetTempPath(), $"fintrackr-receipts-{Guid.NewGuid():N}"));
        builder.UseSetting("BackupsPath", Path.Combine(Path.GetTempPath(), $"fintrackr-backups-{Guid.NewGuid():N}"));
        // The whole suite registers/logs in from one fake client; don't trip the auth limiter.
        builder.UseSetting("RateLimiting:AuthPermitLimit", "1000");
        builder.UseEnvironment("Development");
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        foreach (var suffix in new[] { "", "-shm", "-wal" })
            File.Delete(_dbPath + suffix);
    }

    public async Task<HttpClient> SignedInClient(string email, string password = "test-password-1")
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email, password });
        response.EnsureSuccessStatusCode();
        return client;
    }
}

public class ApiTests : IClassFixture<ApiFixture>
{
    private readonly ApiFixture _factory;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public ApiTests(ApiFixture factory) => _factory = factory;

    private static async Task<JsonElement> ReadJson(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    [Fact]
    public async Task DataEndpoints_Require_Authentication()
    {
        var anonymous = _factory.CreateClient();
        var response = await anonymous.GetAsync("/api/entries");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Register_Seeds_Default_Categories_And_Returns_Currency()
    {
        var client = await _factory.SignedInClient("seed@test.com");
        var me = await ReadJson(await client.GetAsync("/api/auth/me"));
        Assert.Equal("USD", me.GetProperty("currency").GetString());

        var categories = await ReadJson(await client.GetAsync("/api/categories"));
        Assert.Equal(6, categories.GetArrayLength());
    }

    [Fact]
    public async Task Users_Cannot_See_Each_Others_Data()
    {
        var alice = await _factory.SignedInClient("alice@test.com");
        var bob = await _factory.SignedInClient("bob@test.com");

        await alice.PostAsJsonAsync("/api/entries",
            new { amount = 42.5, date = "2026-07-01", vendorName = "Isolation Cafe" });

        var bobEntries = await ReadJson(await bob.GetAsync("/api/entries?search=Isolation"));
        Assert.Equal(0, bobEntries.GetArrayLength());

        // Bob can't file an entry into Alice's categories either.
        var aliceCategories = await ReadJson(await alice.GetAsync("/api/categories"));
        var aliceCategoryId = aliceCategories[0].GetProperty("id").GetInt32();
        var bobCategoryIds = (await ReadJson(await bob.GetAsync("/api/categories")))
            .EnumerateArray().Select(c => c.GetProperty("id").GetInt32()).ToHashSet();
        if (!bobCategoryIds.Contains(aliceCategoryId))
        {
            var stolen = await bob.PostAsJsonAsync("/api/entries",
                new { amount = 1, date = "2026-07-01", categoryId = aliceCategoryId });
            Assert.Equal(HttpStatusCode.BadRequest, stolen.StatusCode);
        }
    }

    [Fact]
    public async Task Vendor_Memory_Learns_And_Files()
    {
        var client = await _factory.SignedInClient("vendor@test.com");
        var categories = await ReadJson(await client.GetAsync("/api/categories"));
        var dining = categories.EnumerateArray().First(c => c.GetProperty("name").GetString() == "Dining");
        var diningId = dining.GetProperty("id").GetInt32();

        await client.PostAsJsonAsync("/api/entries",
            new { amount = 12, date = "2026-07-01", vendorName = "Learning Cafe", categoryId = diningId });

        // Second entry, different casing, no category: vendor memory files it.
        var second = await ReadJson(await client.PostAsJsonAsync("/api/entries",
            new { amount = 9, date = "2026-07-02", vendorName = "learning cafe" }));
        Assert.Equal(diningId, second.GetProperty("categoryId").GetInt32());
        Assert.Equal("Learning Cafe", second.GetProperty("vendorName").GetString());
    }

    [Fact]
    public async Task Month_Summary_Splits_Income_From_Spend()
    {
        var client = await _factory.SignedInClient("summary@test.com");
        await client.PostAsJsonAsync("/api/entries", new { amount = 100, date = "2026-03-05" });
        await client.PostAsJsonAsync("/api/entries",
            new { amount = 2000, date = "2026-03-01", kind = "Income", note = "Paycheck" });

        var summary = await ReadJson(await client.GetAsync("/api/summary/month/2026-03"));
        Assert.Equal(100, summary.GetProperty("spent").GetDecimal());
        Assert.Equal(2000, summary.GetProperty("income").GetDecimal());
        Assert.Equal(2, summary.GetProperty("entryCount").GetInt32());
    }

    [Fact]
    public async Task Validation_Rejects_Bad_Amounts()
    {
        var client = await _factory.SignedInClient("validation@test.com");
        var response = await client.PostAsJsonAsync("/api/entries", new { amount = -5, date = "2026-07-01" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Csv_Roundtrip_Exports_And_Imports()
    {
        var client = await _factory.SignedInClient("csv@test.com");
        await client.PostAsJsonAsync("/api/entries",
            new { amount = 55, date = "2026-06-15", vendorName = "Csv Mart", note = "round, trip" });

        var csv = await (await client.GetAsync("/api/csv/entries.csv")).Content.ReadAsStringAsync();
        Assert.Contains("Csv Mart", csv);
        Assert.Contains("\"round, trip\"", csv);

        var import = await client.PostAsync("/api/csv/entries",
            new StringContent("date,amount,kind,vendor,category,note\n2026-06-16,10,Expense,New Import Vendor,New Import Cat,ok\n",
                Encoding.UTF8, "text/csv"));
        var result = await ReadJson(import);
        Assert.Equal(1, result.GetProperty("imported").GetInt32());

        var entries = await ReadJson(await client.GetAsync("/api/entries?search=New Import Vendor"));
        Assert.Equal(1, entries.GetArrayLength());
    }

    [Fact]
    public async Task Vendor_Merge_Moves_Entries()
    {
        var client = await _factory.SignedInClient("merge@test.com");
        await client.PostAsJsonAsync("/api/entries", new { amount = 5, date = "2026-07-01", vendorName = "Dupe A" });
        await client.PostAsJsonAsync("/api/entries", new { amount = 6, date = "2026-07-02", vendorName = "Dupe B" });

        var vendors = (await ReadJson(await client.GetAsync("/api/vendors"))).EnumerateArray()
            .ToDictionary(v => v.GetProperty("name").GetString()!, v => v.GetProperty("id").GetInt32());
        var merged = await client.PostAsync($"/api/vendors/{vendors["Dupe A"]}/merge/{vendors["Dupe B"]}", null);
        merged.EnsureSuccessStatusCode();

        var entries = await ReadJson(await client.GetAsync("/api/entries?search=Dupe B"));
        Assert.Equal(2, entries.GetArrayLength());
    }

    [Fact]
    public async Task Receipt_Uploads_Serves_And_Deletes()
    {
        var client = await _factory.SignedInClient("receipt@test.com");
        var entry = await ReadJson(await client.PostAsJsonAsync("/api/entries",
            new { amount = 20, date = "2026-07-05", vendorName = "Receipt Shop" }));
        var id = entry.GetProperty("id").GetInt32();

        var form = new MultipartFormDataContent();
        var image = new ByteArrayContent([0x89, 0x50, 0x4E, 0x47]);
        image.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
        form.Add(image, "file", "receipt.png");
        var upload = await client.PostAsync($"/api/entries/{id}/receipt", form);
        upload.EnsureSuccessStatusCode();

        var fetched = await client.GetAsync($"/api/entries/{id}/receipt");
        Assert.Equal("image/png", fetched.Content.Headers.ContentType?.MediaType);

        await client.DeleteAsync($"/api/entries/{id}/receipt");
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/entries/{id}/receipt")).StatusCode);
    }

    [Fact]
    public async Task Tags_Normalize_Round_Trip_And_Filter_Exactly()
    {
        var client = await _factory.SignedInClient("tags@test.com");
        var made = await ReadJson(await client.PostAsJsonAsync("/api/entries",
            new { amount = 30, date = "2026-07-01", vendorName = "Trip Store",
                  tags = new[] { "Kyoto Trip", "gift", "gift" } }));
        var tags = made.GetProperty("tags").EnumerateArray().Select(t => t.GetString()).ToArray();
        Assert.Equal(new[] { "kyoto-trip", "gift" }, tags); // spaced, lowercased, de-duped

        await client.PostAsJsonAsync("/api/entries",
            new { amount = 5, date = "2026-07-02", tags = new[] { "coffee" } });

        var tagged = await ReadJson(await client.GetAsync("/api/entries?tag=kyoto-trip"));
        Assert.Equal(1, tagged.GetArrayLength());
        // A partial ("kyoto") must not match "kyoto-trip".
        var partial = await ReadJson(await client.GetAsync("/api/entries?tag=kyoto"));
        Assert.Equal(0, partial.GetArrayLength());
    }

    [Fact]
    public async Task Category_Group_Persists()
    {
        var client = await _factory.SignedInClient("group@test.com");
        var categories = await ReadJson(await client.GetAsync("/api/categories"));
        var first = categories[0];
        var id = first.GetProperty("id").GetInt32();
        var name = first.GetProperty("name").GetString();

        var updated = await client.PutAsJsonAsync($"/api/categories/{id}",
            new { name, emoji = (string?)null, monthlyBudget = 100, sortOrder = 0, group = " Needs " });
        updated.EnsureSuccessStatusCode();

        var refreshed = await ReadJson(await client.GetAsync($"/api/categories/{id}"));
        Assert.Equal("Needs", refreshed.GetProperty("group").GetString()); // trimmed
    }

    [Fact]
    public async Task Full_Export_Carries_The_Whole_Book()
    {
        var client = await _factory.SignedInClient("export@test.com");
        await client.PostAsJsonAsync("/api/entries",
            new { amount = 12, date = "2026-07-01", vendorName = "Export Cafe", tags = new[] { "brunch" } });

        var export = await client.GetAsync("/api/export");
        export.EnsureSuccessStatusCode();
        Assert.Equal("application/json", export.Content.Headers.ContentType?.MediaType);

        var body = await ReadJson(export);
        Assert.True(body.GetProperty("categories").GetArrayLength() >= 6);
        Assert.Equal(1, body.GetProperty("entries").GetArrayLength());
    }

    [Fact]
    public async Task Import_Propose_Matches_Flags_Duplicates_And_Cleans()
    {
        var client = await _factory.SignedInClient("csvimport@test.com");

        // Kroger is known (filed under Groceries); one row is already hand-kept.
        var categories = (await ReadJson(await client.GetAsync("/api/categories"))).EnumerateArray()
            .ToDictionary(c => c.GetProperty("name").GetString()!, c => c.GetProperty("id").GetInt32());
        await client.PostAsJsonAsync("/api/entries",
            new { amount = 12, date = "2026-06-20", vendorName = "Kroger", categoryId = categories["Groceries"] });
        await client.PostAsJsonAsync("/api/entries",
            new { amount = 54.20, date = "2026-07-02", vendorName = "Kroger" });

        var response = await client.PostAsJsonAsync("/api/import/propose", new
        {
            rows = new object[]
            {
                new { date = "2026-07-02", amount = 54.20, kind = "Expense", description = "POS DEBIT KROGER #442 COLUMBUS OH" },
                new { date = "2026-07-03", amount = 6.50, kind = "Expense", description = "SQ *BLUE SUMATRA COFFEE 8821" },
                new { date = "2026-07-06", amount = 1500.00, kind = "Income", description = "PAYROLL ACME CORP" },
                new { date = "bad-date", amount = 1.00, kind = "Expense", description = "SHOULD BE SKIPPED" },
            },
        });
        response.EnsureSuccessStatusCode();
        var result = await ReadJson(response);
        var proposals = result.GetProperty("proposals").EnumerateArray().ToList();
        Assert.Equal(3, proposals.Count);
        Assert.Contains("left out", result.GetProperty("warnings")[0].GetString());

        // The Kroger row matches the vendor book despite the bank-speak, files
        // under its line — and is flagged as already kept, so it starts skipped.
        var kroger = proposals[0];
        Assert.True(kroger.GetProperty("matched").GetBoolean());
        Assert.Equal("Kroger", kroger.GetProperty("vendorName").GetString());
        Assert.Equal("Groceries", kroger.GetProperty("categoryName").GetString());
        Assert.True(kroger.GetProperty("duplicate").GetBoolean());
        Assert.False(kroger.GetProperty("include").GetBoolean());

        // The stranger arrives cleaned: prefix stripped, number junk dropped,
        // the shouting settled.
        var coffee = proposals[1];
        Assert.False(coffee.GetProperty("matched").GetBoolean());
        Assert.Equal("Blue Sumatra Coffee", coffee.GetProperty("vendorName").GetString());
        Assert.True(coffee.GetProperty("include").GetBoolean());

        // Income never gets forced into a spending line.
        Assert.Equal(JsonValueKind.Null, proposals[2].GetProperty("categoryId").ValueKind);
    }

    [Fact]
    public async Task Import_Profiles_Save_Update_And_Delete()
    {
        var client = await _factory.SignedInClient("profiles@test.com");

        var made = await ReadJson(await client.PostAsJsonAsync("/api/import/profiles",
            new { name = "Chase Checking", mapping = "{\"dateCol\":0}" }));
        var id = made.GetProperty("id").GetInt32();

        // Saving the same name again updates the mapping in place.
        await client.PostAsJsonAsync("/api/import/profiles",
            new { name = "Chase Checking", mapping = "{\"dateCol\":1}" });
        var listed = await ReadJson(await client.GetAsync("/api/import/profiles"));
        Assert.Equal(1, listed.GetArrayLength());
        Assert.Equal("{\"dateCol\":1}", listed[0].GetProperty("mapping").GetString());

        Assert.Equal(HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/import/profiles/{id}")).StatusCode);
        Assert.Equal(0, (await ReadJson(await client.GetAsync("/api/import/profiles"))).GetArrayLength());
    }

    [Fact]
    public async Task Entries_Carry_Vendor_Id_And_Alias_And_Filter_By_Vendor()
    {
        var client = await _factory.SignedInClient("vendorfilter@test.com");
        var made = await ReadJson(await client.PostAsJsonAsync("/api/entries",
            new { amount = 12, date = "2026-07-01", vendorName = "Amazon" }));
        var vendorId = made.GetProperty("vendorId").GetInt32();

        // Give the vendor an alias, then confirm it rides along on the entry.
        await client.PutAsJsonAsync($"/api/vendors/{vendorId}",
            new { name = "Amazon", alias = "AMZN MKTP US", defaultCategoryId = (int?)null });
        var refetched = await ReadJson(await client.GetAsync($"/api/entries?vendorId={vendorId}"));
        Assert.Equal(1, refetched.GetArrayLength());
        Assert.Equal("AMZN MKTP US", refetched[0].GetProperty("vendorAlias").GetString());

        // A different vendor's entry is excluded by the filter.
        await client.PostAsJsonAsync("/api/entries",
            new { amount = 5, date = "2026-07-02", vendorName = "Other Shop" });
        var onlyAmazon = await ReadJson(await client.GetAsync($"/api/entries?vendorId={vendorId}"));
        Assert.Equal(1, onlyAmazon.GetArrayLength());
    }

    [Fact]
    public async Task Variable_Recurring_Records_By_Hand_And_Advances()
    {
        var client = await _factory.SignedInClient("utility@test.com");
        var made = await ReadJson(await client.PostAsJsonAsync("/api/recurring",
            new { name = "Electric", amount = 90, cadence = "Monthly", nextDate = "2026-07-15", variable = true }));
        var id = made.GetProperty("id").GetInt32();
        Assert.True(made.GetProperty("variable").GetBoolean());

        // Recording the real amount files an entry dated to the due day and rolls it forward.
        var advanced = await ReadJson(await client.PostAsJsonAsync($"/api/recurring/{id}/record",
            new { amount = 112.40 }));
        Assert.Equal("2026-08-15", advanced.GetProperty("nextDate").GetString());
        var filed = await ReadJson(await client.GetAsync("/api/entries?search=Electric"));
        Assert.Equal(1, filed.GetArrayLength());
        Assert.Equal(112.40m, filed[0].GetProperty("amount").GetDecimal());
        Assert.Equal("2026-07-15", filed[0].GetProperty("date").GetString());
    }

    [Fact]
    public async Task Recurring_Edit_Records_Price_Creep()
    {
        var client = await _factory.SignedInClient("creep@test.com");
        var made = await ReadJson(await client.PostAsJsonAsync("/api/recurring",
            new { name = "Streaming", amount = 15.99, cadence = "Monthly", nextDate = "2026-07-20" }));
        var id = made.GetProperty("id").GetInt32();

        var raised = await ReadJson(await client.PutAsJsonAsync($"/api/recurring/{id}",
            new { name = "Streaming", amount = 17.99, cadence = "Monthly", nextDate = "2026-07-20" }));
        Assert.Equal(15.99m, raised.GetProperty("previousAmount").GetDecimal());
        Assert.Equal(17.99m, raised.GetProperty("amount").GetDecimal());
        Assert.NotEqual(JsonValueKind.Null, raised.GetProperty("amountChangedAt").ValueKind);
    }

    [Fact]
    public async Task Worth_Verdict_Sets_And_Validates()
    {
        var client = await _factory.SignedInClient("worth@test.com");
        var entry = await ReadJson(await client.PostAsJsonAsync("/api/entries",
            new { amount = 80, date = "2026-07-01", vendorName = "Splurge Co" }));
        var id = entry.GetProperty("id").GetInt32();

        var marked = await ReadJson(await client.PostAsJsonAsync($"/api/entries/{id}/worth",
            new { worth = "Regret" }));
        Assert.Equal("Regret", marked.GetProperty("worth").GetString());

        var bad = await client.PostAsJsonAsync($"/api/entries/{id}/worth", new { worth = "Maybe" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task Challenge_Reports_Live_Progress()
    {
        var client = await _factory.SignedInClient("challenge@test.com");
        var categories = await ReadJson(await client.GetAsync("/api/categories"));
        var dining = categories.EnumerateArray()
            .First(c => c.GetProperty("name").GetString() == "Dining").GetProperty("id").GetInt32();
        await client.PostAsJsonAsync("/api/entries",
            new { amount = 60, date = "2026-07-03", categoryId = dining });

        await client.PostAsJsonAsync("/api/challenges",
            new { kind = "CategoryUnder", target = 200, categoryId = dining, month = "2026-07" });

        var challenges = await ReadJson(await client.GetAsync("/api/challenges"));
        var first = challenges[0];
        Assert.Equal(60, first.GetProperty("current").GetDecimal());
        Assert.True(first.GetProperty("done").GetBoolean()); // 60 <= 200
    }

    [Fact]
    public async Task Coaching_Settings_Round_Trip()
    {
        var client = await _factory.SignedInClient("coach@test.com");
        // A fresh account has gentle nudges on, the rituals off.
        var me = await ReadJson(await client.GetAsync("/api/auth/me"));
        Assert.True(me.GetProperty("overspendNudge").GetBoolean());
        Assert.False(me.GetProperty("reflection").GetBoolean());

        var updated = await ReadJson(await client.PutAsJsonAsync("/api/auth/settings",
            new { reflection = true, monthlySavingsTarget = 400, savingsRateTarget = 20 }));
        Assert.True(updated.GetProperty("reflection").GetBoolean());
        Assert.Equal(400, updated.GetProperty("monthlySavingsTarget").GetDecimal());
        Assert.Equal(20, updated.GetProperty("savingsRateTarget").GetInt32());
    }

    [Fact]
    public async Task Savings_Bucket_Allows_No_Target()
    {
        var client = await _factory.SignedInClient("savings@test.com");

        var withTarget = await ReadJson(await client.PostAsJsonAsync("/api/goals",
            new { name = "Kyoto", targetAmount = 3000 }));
        Assert.Equal(3000, withTarget.GetProperty("targetAmount").GetDecimal());

        // A plain category carries no target.
        var plain = await client.PostAsJsonAsync("/api/goals", new { name = "Emergency" });
        Assert.Equal(HttpStatusCode.Created, plain.StatusCode);
        var body = await ReadJson(plain);
        Assert.Equal(JsonValueKind.Null, body.GetProperty("targetAmount").ValueKind);

        // …and can still hold money.
        var id = body.GetProperty("id").GetInt32();
        var funded = await ReadJson(await client.PostAsJsonAsync($"/api/goals/{id}/contribute",
            new { amount = 250 }));
        Assert.Equal(250, funded.GetProperty("savedAmount").GetDecimal());
    }

    [Fact]
    public async Task Fresh_Start_Strikes_Data_And_Reseeds_Lines()
    {
        var client = await _factory.SignedInClient("freshstart@test.com");
        await client.PostAsJsonAsync("/api/entries",
            new { amount = 12, date = "2026-07-01", vendorName = "Old Life Coffee" });
        await client.PostAsJsonAsync("/api/goals", new { name = "Old jar", targetAmount = 100 });
        await client.PostAsJsonAsync("/api/debts", new { name = "Old card", startingAmount = 500 });
        // A category-linked challenge: fresh-start must clear it before its category.
        var freshCats = await ReadJson(await client.GetAsync("/api/categories"));
        await client.PostAsJsonAsync("/api/challenges", new
        {
            kind = "CategoryUnder",
            target = 100,
            categoryId = freshCats[0].GetProperty("id").GetInt32(),
            month = "2026-07",
        });

        var wrongPassword = await client.PostAsJsonAsync("/api/auth/fresh-start", new { password = "not-it" });
        Assert.Equal(HttpStatusCode.BadRequest, wrongPassword.StatusCode);

        var fresh = await client.PostAsJsonAsync("/api/auth/fresh-start", new { password = "test-password-1" });
        Assert.Equal(HttpStatusCode.NoContent, fresh.StatusCode);

        // The book is blank, the starter lines are back, and the session survives.
        Assert.Equal(0, (await ReadJson(await client.GetAsync("/api/entries"))).GetArrayLength());
        Assert.Equal(0, (await ReadJson(await client.GetAsync("/api/goals"))).GetArrayLength());
        Assert.Equal(0, (await ReadJson(await client.GetAsync("/api/debts"))).GetArrayLength());
        Assert.Equal(0, (await ReadJson(await client.GetAsync("/api/vendors"))).GetArrayLength());
        Assert.Equal(0, (await ReadJson(await client.GetAsync("/api/challenges"))).GetArrayLength());
        Assert.Equal(6, (await ReadJson(await client.GetAsync("/api/categories"))).GetArrayLength());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Change_Password_Invalidates_Old_Credential()
    {
        var client = await _factory.SignedInClient("rotate@test.com", "original-pass-1");
        var change = await client.PostAsJsonAsync("/api/auth/change-password",
            new { currentPassword = "original-pass-1", newPassword = "rotated-pass-2" });
        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);

        var fresh = _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var oldLogin = await fresh.PostAsJsonAsync("/api/auth/login",
            new { email = "rotate@test.com", password = "original-pass-1" });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);

        var newLogin = await fresh.PostAsJsonAsync("/api/auth/login",
            new { email = "rotate@test.com", password = "rotated-pass-2" });
        newLogin.EnsureSuccessStatusCode();
    }
}
