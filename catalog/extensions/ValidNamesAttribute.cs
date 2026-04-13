using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Catalog;

/// <summary>
/// Validates that all strings in a collection are valid names containing only letters, digits, hyphens, underscores, periods, and colons.
/// Supports Dictionary&lt;string, object&gt; (validates keys) and IEnumerable&lt;string&gt;.
/// Null values are valid.
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter, AllowMultiple = false)]
public class ValidNamesAttribute : ValidationAttribute
{
    public ValidNamesAttribute()
        : base("The {0} field must contain only letters, digits, hyphens, underscores, periods, or colons.")
    {
    }

    public override bool IsValid(object? value)
    {
        if (value is null)
        {
            return true;
        }

        // Handle IDictionary<string, object> - validate keys only
        if (value is IDictionary<string, object> dictionary)
        {
            if (dictionary.Count == 0)
            {
                return false;
            }
            foreach (var key in dictionary.Keys)
            {
                if (!key.IsValidName())
                {
                    return false;
                }
            }
            return true;
        }

        // Handle IEnumerable<string>
        if (value is IEnumerable<string> strings)
        {
            bool hasItems = false;
            foreach (var str in strings)
            {
                hasItems = true;
                if (!str.IsValidName())
                {
                    return false;
                }
            }
            return hasItems;
        }

        return false;
    }
}
