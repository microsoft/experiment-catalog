using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Catalog;
using Xunit;

namespace Catalog.Tests;

public class ExperimentDisplayTests
{
    [Fact]
    public void MetadataPreservesBaselineAndRoundTripsUnicode()
    {
        var metadata = new Dictionary<string, string>
        {
            ["exp_catalog_type"] = "project",
            ["baseline"] = "original-set",
            ["other"] = "keep-me",
        };

        CardDisplayMetadata.Apply(metadata, new CardDisplay
        {
            Emoji = "rocket",
            Note = "  modèle 🔬  ",
        });

        Assert.Equal("original-set", metadata["baseline"]);
        Assert.Equal("project", metadata["exp_catalog_type"]);
        Assert.Equal("keep-me", metadata["other"]);
        Assert.All(metadata.Values, value => Assert.All(value, character => Assert.True(character <= 127)));
        var display = CardDisplayMetadata.Read(metadata);
        Assert.Equal("rocket", display.Emoji);
        Assert.Equal("modèle 🔬", display.Note);

        CardDisplayMetadata.Apply(metadata, new CardDisplay());
        Assert.Null(CardDisplayMetadata.Read(metadata).Emoji);
        Assert.Null(CardDisplayMetadata.Read(metadata).Note);
        Assert.Equal("original-set", metadata["baseline"]);
    }

    [Theory]
    [InlineData("rocket", "short", true)]
    [InlineData("target", "short", true)]
    [InlineData("lightning", "short", true)]
    [InlineData("puzzle", "short", true)]
    [InlineData("compass", "short", true)]
    [InlineData("robot", "short", true)]
    [InlineData("check", "short", true)]
    [InlineData("seedling", "short", true)]
    [InlineData("trophy", "short", true)]
    [InlineData("other", "short", false)]
    [InlineData("rocket", "12345678901234567890123456789012345678901", false)]
    public void InputRestrictsEmojiAndNoteLength(string emoji, string note, bool valid)
    {
        var display = new CardDisplay { Emoji = emoji, Note = note };
        var results = new List<ValidationResult>();
        Assert.Equal(valid, Validator.TryValidateObject(
            display, new ValidationContext(display), results, validateAllProperties: true));
    }

    [Fact]
    public void InvalidEncodedNoteFailsExplicitly()
    {
        var metadata = new Dictionary<string, string> { ["display_note_b64"] = "invalid-base64" };
        Assert.Throws<FormatException>(() => CardDisplayMetadata.Read(metadata));
    }
}
