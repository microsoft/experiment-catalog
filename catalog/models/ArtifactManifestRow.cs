using Newtonsoft.Json;

namespace Catalog;

public class ArtifactManifestRow
{
    [JsonProperty("type", Required = Required.Always)]
    public required string Type { get; set; }

    [JsonProperty("set", Required = Required.Always)]
    public required string Set { get; set; }

    [JsonProperty("ref", Required = Required.Always)]
    public required string Ref { get; set; }

    [JsonProperty("iteration", Required = Required.Always)]
    public required int Iteration { get; set; }

    [JsonProperty("uri", Required = Required.Always)]
    public required string Uri { get; set; }
}
