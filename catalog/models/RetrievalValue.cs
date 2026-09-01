using System.Collections.Generic;
using Newtonsoft.Json;

namespace Catalog;

public class RetrievalValue
{
    [JsonProperty("found", Required = Required.Always)]
    public required List<string> Found { get; set; }

    [JsonProperty("expected", Required = Required.Always)]
    public required List<string> Expected { get; set; }
}
