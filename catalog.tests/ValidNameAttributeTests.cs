using Catalog;
using Xunit;

namespace Catalog.Tests;

public class ValidNameAttributeTests
{
    private readonly ValidNameAttribute _attribute = new();

    [Theory]
    [InlineData("valid-name", true)]
    [InlineData("validname", true)]
    [InlineData("12345", true)]
    [InlineData("valid-name-test", true)]
    [InlineData("valid_name_test", true)]
    [InlineData("valid.name.test", true)]
    [InlineData("valid:name:test", true)]
    [InlineData("a1-b_c.d:e", true)]
    [InlineData("abc", true)]
    [InlineData("ValidName", true)] // mixed case
    [InlineData("名前テスト", true)] // Unicode letters
    [InlineData("a", true)] // minimum length (1 char)
    [InlineData("ab", true)] // 2 chars valid
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("invalid name", false)] // space
    [InlineData("invalid@name", false)]
    [InlineData("invalid#name", false)]
    [InlineData("invalid$name", false)]
    [InlineData("invalid!name", false)]
    [InlineData("invalid/name", false)]
    [InlineData("invalid\\name", false)]
    [InlineData(null, true)] // null is valid (optional field)
    public void IsValid_String_ReturnsExpected(string? value, bool expected)
    {
        Assert.Equal(expected, _attribute.IsValid(value));
    }

    [Theory]
    [MemberData(nameof(BoundaryLengthTestData))]
    public void IsValid_StringBoundaryLength_ReturnsExpected(string value, bool expected)
    {
        Assert.Equal(expected, _attribute.IsValid(value));
    }

    public static TheoryData<string, bool> BoundaryLengthTestData => new()
    {
        { new string('a', 50), true }, // exactly maximum
        { "a1-b_c.d:e" + new string('x', 40), true }, // exactly 50 chars
        { new string('a', 51), false } // exceeds maximum
    };

    [Fact]
    public void IsValid_NonStringType_ReturnsFalse()
    {
        Assert.False(_attribute.IsValid(123));
        Assert.False(_attribute.IsValid(new object()));
    }
}
