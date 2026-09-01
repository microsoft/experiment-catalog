using System.Collections.Generic;
using Catalog;
using Newtonsoft.Json.Linq;
using Xunit;

namespace Catalog.Tests;

public class AddResultRequestTests
{
    [Fact]
    public void ToMetrics_ParsesRetrievalValue()
    {
        var request = new AddResultRequest
        {
            Metrics = new Dictionary<string, object>
            {
                ["retrieval"] = JObject.Parse(
                    """{"found":["A","B","D"],"expected":["B","C","D"]}"""),
            },
        };

        var retrieval = request.ToMetrics()!["retrieval"].Retrieval;

        Assert.NotNull(retrieval);
        Assert.Equal(["A", "B", "D"], retrieval.Found);
        Assert.Equal(["B", "C", "D"], retrieval.Expected);
    }

    [Theory]
    [InlineData("""{"found":["A","A"],"expected":["A"]}""")]
    [InlineData("""{"found":["A"],"expected":["A","A"]}""")]
    [InlineData("""{"found":["A"]}""")]
    [InlineData("""{"found":"A","expected":["A"]}""")]
    [InlineData("""{"found":[1],"expected":["1"]}""")]
    [InlineData("""{"found":["A"],"expected":["A"],"other":[]}""")]
    public void ToMetrics_RejectsInvalidRetrievalValue(string json)
    {
        var request = new AddResultRequest
        {
            Metrics = new Dictionary<string, object>
            {
                ["retrieval"] = JObject.Parse(json),
            },
        };

        Assert.Throws<HttpException>(() => request.ToMetrics());
    }

    [Fact]
    public void ToMetrics_AcceptsF1ClassificationValue()
    {
        var request = new AddResultRequest
        {
            Metrics = new Dictionary<string, object>
            {
                ["retrieval_f1"] = "t+",
            },
        };

        Assert.Equal("t+", request.ToMetrics()!["retrieval_f1"].Classification);
    }
}
