using System;
using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace Catalog;

public class HiddenSetRecord : StorageRecord
{
    [JsonProperty("set", Required = Required.Always)]
    [Required, ValidName]
    public required string Set { get; set; }

    [JsonProperty("created")]
    public DateTime Created { get; set; } = DateTime.UtcNow;
}
