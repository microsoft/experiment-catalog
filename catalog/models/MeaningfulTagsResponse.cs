using System.Collections.Generic;
using Newtonsoft.Json;

namespace Catalog;

public class TagDiff
{
    public decimal Impact { get; set; }
    public decimal Diff { get; set; }
    public required string Tag { get; set; }
    public int? Count { get; set; }
}

public class MeaningfulTagsResponse
{
    [JsonProperty("tags")]
    public IEnumerable<TagDiff>? Tags { get; set; } = null;
}