using Newtonsoft.Json;

namespace Catalog;

public class AuthStatus
{
    [JsonProperty("is_required")]
    public bool IsRequired { get; set; }

    [JsonProperty("username", NullValueHandling = NullValueHandling.Ignore)]
    public string? Username { get; set; }
}