using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace Catalog;

public class CardDisplay
{
    public const string EmojiPattern = "^(star|rocket|bulb|flask|chart|search|flag|warning|target|lightning|puzzle|compass|robot|check|seedling|trophy)$";

    [JsonProperty("emoji")]
    [RegularExpression(EmojiPattern)]
    public string? Emoji { get; set; }

    [JsonProperty("note")]
    [StringLength(40)]
    public string? Note { get; set; }
}
