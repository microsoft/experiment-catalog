using System;
using System.Collections.Generic;
using Catalog;
using Xunit;

namespace Catalog.Tests;

public class ValidNamesAttributeTests
{
    private readonly ValidNamesAttribute _attribute = new();

    #region Dictionary Tests

    [Theory]
    [MemberData(nameof(ValidDictionaryTestData))]
    public void IsValid_Dictionary_ReturnsTrue(Dictionary<string, object>? dict)
    {
        Assert.True(_attribute.IsValid(dict));
    }

    [Theory]
    [MemberData(nameof(InvalidDictionaryTestData))]
    public void IsValid_Dictionary_ReturnsFalse(Dictionary<string, object> dict)
    {
        Assert.False(_attribute.IsValid(dict));
    }

    public static TheoryData<Dictionary<string, object>?> ValidDictionaryTestData => new()
    {
        new Dictionary<string, object> { { "valid-key", "value1" }, { "another_key", 123 } },
        new Dictionary<string, object> { { "validkey", "value" } },
        new Dictionary<string, object>
        {
            { "letters", 1 },
            { "123456", 2 },
            { "with-hyphens", 3 },
            { "with_underscores", 4 },
            { "with.periods", 5 },
            { "with:colons", 6 }
        },
        null // null collections are valid
    };

    public static TheoryData<Dictionary<string, object>> InvalidDictionaryTestData => new()
    {
        new Dictionary<string, object>(), // empty
        new Dictionary<string, object> { { "valid-key", "value1" }, { "invalid key", "value2" } }, // space in key
        new Dictionary<string, object> { { new string('a', 51), "value" } }, // too long
        new Dictionary<string, object> { { "invalid@key", "value" } } // special char
    };

    #endregion

    #region IEnumerable<string> Tests

    [Theory]
    [MemberData(nameof(ValidEnumerableTestData))]
    public void IsValid_Enumerable_ReturnsTrue(IEnumerable<string>? values)
    {
        Assert.True(_attribute.IsValid(values));
    }

    [Theory]
    [MemberData(nameof(InvalidEnumerableTestData))]
    public void IsValid_Enumerable_ReturnsFalse(IEnumerable<string?> values)
    {
        Assert.False(_attribute.IsValid(values));
    }

    public static TheoryData<IEnumerable<string>?> ValidEnumerableTestData => new()
    {
        new List<string> { "valid-name", "another_name", "name.test" },
        new List<string> { "validname" },
        new[] { "valid-name", "another_name" },
        new HashSet<string> { "valid-name", "another_name" },
        null // null collections are valid
    };

    public static TheoryData<IEnumerable<string?>> InvalidEnumerableTestData => new()
    {
        new List<string>(), // empty list
        new List<string> { "valid-name", "invalid name" }, // space
        new List<string> { "valid-name", new string('a', 51) }, // too long
        new List<string?> { "valid-name", null }, // null element
        new List<string> { "valid-name", "" }, // empty element
        new List<string> { "valid-name", "   " }, // whitespace element
        new[] { "valid-name", "invalid name" }, // array with invalid
        Array.Empty<string>(), // empty array
        new HashSet<string> { "valid-name", "invalid name" } // hashset with invalid
    };

    #endregion

    #region Unsupported Type Tests

    [Theory]
    [MemberData(nameof(UnsupportedTypeTestData))]
    public void IsValid_UnsupportedType_ReturnsFalse(object? value)
    {
        Assert.False(_attribute.IsValid(value));
    }

    public static TheoryData<object?> UnsupportedTypeTestData => new()
    {
        123,
        new object(),
        new List<int> { 1, 2, 3 },
        new Dictionary<int, object> { { 1, "value" } }
    };

    #endregion
}
