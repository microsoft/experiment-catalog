using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace Catalog;

public class ProjectDisplay
{
    [JsonProperty("emoji", Required = Required.AllowNull)]
    [RegularExpression(CardDisplay.EmojiPattern)]
    public string? Emoji { get; set; }

    [JsonProperty("note", Required = Required.AllowNull)]
    [StringLength(40)]
    public string? Note { get; set; }

    [JsonProperty("ground_truth", Required = Required.AllowNull)]
    [StringLength(40)]
    public string? GroundTruth { get; set; }
}
