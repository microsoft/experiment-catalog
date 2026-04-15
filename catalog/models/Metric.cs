using System.Collections.Generic;
using Newtonsoft.Json;

namespace Catalog;

public class Metric
{
    [JsonProperty("count", NullValueHandling = NullValueHandling.Ignore)]
    public int? Count { get; set; }

    [JsonProperty("value", NullValueHandling = NullValueHandling.Ignore)]
    public decimal? Value { get; set; }

    [JsonProperty("normalized", NullValueHandling = NullValueHandling.Ignore)]
    public decimal? Normalized { get; set; }

    [JsonProperty("std_dev", NullValueHandling = NullValueHandling.Ignore)]
    public decimal? StdDev { get; set; }

    [JsonProperty("p_value", NullValueHandling = NullValueHandling.Ignore)]
    public decimal? PValue { get; set; }

    [JsonProperty("ci_lower", NullValueHandling = NullValueHandling.Ignore)]
    public decimal? CILower { get; set; }

    [JsonProperty("ci_upper", NullValueHandling = NullValueHandling.Ignore)]
    public decimal? CIUpper { get; set; }

    [JsonProperty("classification", NullValueHandling = NullValueHandling.Ignore)]
    public string? Classification { get; set; }
}