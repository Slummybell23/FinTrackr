using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace FinTrackr.Api.Tests;

/// <summary>Fresh fixture: admin status depends on registration order.</summary>
public class AdminTests(ApiFixture factory) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task First_User_Administers_The_Instance()
    {
        var first = factory.CreateClient(new() { HandleCookies = true });
        var firstUser = JsonDocument.Parse(await (await first.PostAsJsonAsync("/api/auth/register",
                new { email = "one@test.com", password = "test-password-1" }))
            .Content.ReadAsStringAsync()).RootElement;
        Assert.True(firstUser.GetProperty("isAdmin").GetBoolean());

        var second = factory.CreateClient(new() { HandleCookies = true });
        var secondUser = JsonDocument.Parse(await (await second.PostAsJsonAsync("/api/auth/register",
                new { email = "two@test.com", password = "test-password-1" }))
            .Content.ReadAsStringAsync()).RootElement;
        Assert.False(secondUser.GetProperty("isAdmin").GetBoolean());

        // Only the admin may snapshot or export the whole database.
        Assert.Equal(HttpStatusCode.Forbidden, (await second.PostAsync("/api/admin/backup", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await second.GetAsync("/api/admin/database")).StatusCode);

        (await first.PostAsync("/api/admin/backup", null)).EnsureSuccessStatusCode();
        var export = await first.GetAsync("/api/admin/database");
        export.EnsureSuccessStatusCode();
        Assert.Equal("application/vnd.sqlite3", export.Content.Headers.ContentType?.MediaType);
    }
}
