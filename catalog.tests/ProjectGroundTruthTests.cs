using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using Catalog;
using Newtonsoft.Json;
using Xunit;

namespace Catalog.Tests;

public class ProjectGroundTruthTests
{
    [Fact]
    public void MetadataRoundTripsUnicodeAndPreservesDisplayAndBaseline()
    {
        var metadata = new Dictionary<string, string>
        {
            ["exp_catalog_type"] = "project",
            ["baseline"] = "baseline-experiment",
            ["other"] = "keep-me",
        };
        CardDisplayMetadata.Apply(metadata, new CardDisplay { Emoji = "flask", Note = "short note" });

        CardDisplayMetadata.ApplyGroundTruth(metadata, "  vérité terrain 🔬  ");
        Assert.Equal("vérité terrain 🔬", CardDisplayMetadata.ReadGroundTruth(metadata));
        Assert.All(metadata.Values, value => Assert.All(value, character => Assert.True(character <= 127)));
        Assert.Equal("baseline-experiment", metadata["baseline"]);
        Assert.Equal("project", metadata["exp_catalog_type"]);

        CardDisplayMetadata.Apply(metadata, new CardDisplay { Emoji = "robot", Note = "edited note" });
        Assert.Equal("vérité terrain 🔬", CardDisplayMetadata.ReadGroundTruth(metadata));
        CardDisplayMetadata.ApplyGroundTruth(metadata, null);
        Assert.Null(CardDisplayMetadata.ReadGroundTruth(metadata));
        Assert.Equal("robot", CardDisplayMetadata.Read(metadata).Emoji);
        Assert.Equal("edited note", CardDisplayMetadata.Read(metadata).Note);
        Assert.Equal("keep-me", metadata["other"]);
    }

    [Theory]
    [InlineData(40, true)]
    [InlineData(41, false)]
    public void GroundTruthHasFortyCharacterLimit(int length, bool valid)
    {
        var request = new ProjectDisplay { GroundTruth = new string('x', length) };
        var results = new List<ValidationResult>();
        Assert.Equal(valid, Validator.TryValidateObject(
            request, new ValidationContext(request), results, validateAllProperties: true));
    }

    [Fact]
    public void InvalidEncodedGroundTruthFailsExplicitly()
    {
        var metadata = new Dictionary<string, string> { ["ground_truth_name_b64"] = "invalid-base64" };
        Assert.Throws<FormatException>(() => CardDisplayMetadata.ReadGroundTruth(metadata));
    }

    [Fact]
    public void ProjectDisplayRequiresAllThreeFieldsToPreventAccidentalClearing()
    {
        Assert.Throws<JsonSerializationException>(() =>
            JsonConvert.DeserializeObject<ProjectDisplay>("{\"emoji\":\"star\",\"note\":null}"));
        Assert.Throws<JsonSerializationException>(() =>
            JsonConvert.DeserializeObject<ProjectDisplay>(
                "{\"emoji\":null,\"note\":null,\"ground_truth_name\":\"old\"}"));
        var display = JsonConvert.DeserializeObject<ProjectDisplay>(
            "{\"emoji\":null,\"note\":null,\"ground_truth\":null}");
        Assert.NotNull(display);
    }

    [Fact]
    public void ProjectResponseUsesGroundTruthProperty()
    {
        var json = JsonConvert.SerializeObject(new Project { Name = "example", GroundTruth = "dataset-v2" });
        Assert.Contains("\"ground_truth\":\"dataset-v2\"", json);
        Assert.DoesNotContain("ground_truth_name", json);
    }
}
