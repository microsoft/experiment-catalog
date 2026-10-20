using System;
using System.Collections.Generic;
using System.Text;

namespace Catalog;

public static class CardDisplayMetadata
{
    private const string EmojiKey = "display_emoji";
    private const string NoteKey = "display_note_b64";
    // Keep the existing metadata key so previously saved project values remain readable.
    private const string GroundTruthKey = "ground_truth_name_b64";
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    public static void Apply(IDictionary<string, string> metadata, CardDisplay display)
    {
        if (string.IsNullOrEmpty(display.Emoji)) metadata.Remove(EmojiKey);
        else metadata[EmojiKey] = display.Emoji;

        ApplyText(metadata, NoteKey, display.Note);
    }

    public static CardDisplay Read(IDictionary<string, string> metadata)
    {
        var display = new CardDisplay();
        if (metadata.TryGetValue(EmojiKey, out var emoji)) display.Emoji = emoji;
        display.Note = ReadText(metadata, NoteKey);
        return display;
    }

    public static void ApplyGroundTruth(IDictionary<string, string> metadata, string? name) =>
        ApplyText(metadata, GroundTruthKey, name);

    public static string? ReadGroundTruth(IDictionary<string, string> metadata) =>
        ReadText(metadata, GroundTruthKey);

    private static void ApplyText(IDictionary<string, string> metadata, string key, string? value)
    {
        var text = value?.Trim();
        if (string.IsNullOrEmpty(text)) metadata.Remove(key);
        else metadata[key] = Convert.ToBase64String(StrictUtf8.GetBytes(text));
    }

    private static string? ReadText(IDictionary<string, string> metadata, string key) =>
        metadata.TryGetValue(key, out var encoded)
            ? StrictUtf8.GetString(Convert.FromBase64String(encoded))
            : null;
}
