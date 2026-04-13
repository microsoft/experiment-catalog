using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace Catalog;

public class Tag
{
    [JsonProperty("name", Required = Required.Always)]
    [Required, ValidName]
    public required string Name { get; set; }

    [JsonProperty("refs", NullValueHandling = NullValueHandling.Ignore)]
    [ValidNames]
    public List<string>? Refs { get; set; } = null;
}