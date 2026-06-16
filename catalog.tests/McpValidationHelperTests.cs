using Catalog;
using Xunit;

namespace Catalog.Tests;

public class McpValidationHelperTests
{
    [Fact]
    public void ValidateRequiredName_ValueExceedsMaximumLength_ThrowsLengthError()
    {
        var exception = Assert.Throws<HttpException>(
            () => McpValidationHelper.ValidateRequiredName(new string('a', 101), "ref"));

        Assert.Equal(400, exception.StatusCode);
        Assert.Equal("The ref field must be 100 characters or fewer.", exception.Message);
    }

    [Fact]
    public void ValidateOptionalNames_ValueExceedsMaximumLength_ThrowsLengthError()
    {
        var exception = Assert.Throws<HttpException>(
            () => McpValidationHelper.ValidateOptionalNames([new string('a', 101)], "metrics"));

        Assert.Equal(400, exception.StatusCode);
        Assert.Equal("The metrics field contains a name that exceeds the maximum length of 100 characters.", exception.Message);
    }
}
