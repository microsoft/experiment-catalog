using Catalog;
using System.ComponentModel.DataAnnotations;
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
        { "a1-b_c.d:e" + new string('x', 90), true }, // exactly 100 chars
        { new string('a', 100), true }, // exactly maximum
        { new string('a', 101), false } // exceeds maximum
    };

    [Fact]
    public void IsValid_NonStringType_ReturnsFalse()
    {
        Assert.False(_attribute.IsValid(123));
        Assert.False(_attribute.IsValid(new object()));
    }

    [Fact]
    public void GetValidationResult_ReportedRefUnderMaximumLength_ReturnsSuccess()
    {
        var context = new ValidationContext(new AddResultRequest()) { MemberName = nameof(AddResultRequest.Ref) };
        var result = _attribute.GetValidationResult(
            "conv_ae8dab69b18a06f100ZzSeiXIcJq0impw7szyUJRIQQbya1Pgq_01",
            context);

        Assert.Null(result);
    }

    [Fact]
    public void GetValidationResult_RefExceedsMaximumLength_ReturnsLengthError()
    {
        var context = new ValidationContext(new AddResultRequest()) { MemberName = nameof(AddResultRequest.Ref) };
        var result = _attribute.GetValidationResult(new string('a', 101), context);

        Assert.NotNull(result);
        Assert.Equal("The Ref field must be 100 characters or fewer.", result.ErrorMessage);
    }

    [Fact]
    public void GetValidationResult_RefContainsInvalidCharacter_ReturnsCharacterError()
    {
        var context = new ValidationContext(new AddResultRequest()) { MemberName = nameof(AddResultRequest.Ref) };
        var result = _attribute.GetValidationResult("invalid/name", context);

        Assert.NotNull(result);
        Assert.Equal(
            "The Ref field must contain only letters, digits, hyphens, underscores, periods, or colons.",
            result.ErrorMessage);
    }
}
