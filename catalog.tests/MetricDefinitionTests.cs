using Catalog;
using Newtonsoft.Json;
using Xunit;

namespace Catalog.Tests;

public class MetricDefinitionTests
{
    [Fact]
    public void Description_RoundTripsWhenProvided()
    {
        var definition = new MetricDefinition
        {
            Name = "accuracy",
            Description = "Fraction of responses judged correct.",
        };

        var json = JsonConvert.SerializeObject(definition);
        var restored = JsonConvert.DeserializeObject<MetricDefinition>(json);

        Assert.Contains("\"description\":\"Fraction of responses judged correct.\"", json);
        Assert.Equal(definition.Description, restored!.Description);
    }

    [Fact]
    public void Description_IsOmittedWhenUnset()
    {
        var definition = new MetricDefinition { Name = "accuracy" };

        var json = JsonConvert.SerializeObject(definition);

        Assert.DoesNotContain("\"description\"", json);
    }
}
