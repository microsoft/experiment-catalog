using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace Catalog;

public class MetricDefinition
{
    [JsonProperty("name", Required = Required.Always)]
    [Required, ValidName]
    public required string Name { get; set; }

    [JsonProperty("min", NullValueHandling = NullValueHandling.Ignore)]
    public decimal? Min { get; set; }

    [JsonProperty("max", NullValueHandling = NullValueHandling.Ignore)]
    public decimal? Max { get; set; }

    [JsonProperty("aggregate_function")]
    [JsonConverter(typeof(StringEnumConverter))]
    public AggregateFunctions AggregateFunction { get; set; } = AggregateFunctions.Default;

    [JsonProperty("order", NullValueHandling = NullValueHandling.Ignore)]
    public int? Order { get; set; }

    [JsonProperty("tags", NullValueHandling = NullValueHandling.Ignore)]
    [ValidNames]
    public IList<string>? Tags { get; set; }

    public bool TryNormalize(decimal? value, out decimal normalized)
    {
        if (value is not null && this.Min is not null && this.Max is not null && this.Max > this.Min)
        {
            normalized = (value - this.Min) / (this.Max - this.Min) ?? 0;
            return true;
        }
        else if (value is not null && this.Min is not null && this.Max is not null && this.Min > this.Max)
        {
            normalized = (this.Min - (decimal)value) / (this.Min - this.Max) ?? 0;
            return true;
        }
        normalized = default;
        return false;
    }
}