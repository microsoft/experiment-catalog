using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace Catalog;

public class Project
{
    [JsonProperty("name", Required = Required.Always)]
    [Required, ValidName, ValidProjectName]
    public required string Name { get; set; }

    [JsonProperty("emoji")]
    public string? Emoji { get; set; }

    [JsonProperty("note")]
    public string? Note { get; set; }

    [JsonProperty("ground_truth")]
    public string? GroundTruth { get; set; }
}