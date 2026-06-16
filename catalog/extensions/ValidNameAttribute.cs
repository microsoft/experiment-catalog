using System;
using System.ComponentModel.DataAnnotations;

namespace Catalog;

/// <summary>
/// Validates that a string is a valid name containing only letters, digits, hyphens, underscores, periods, and colons.
/// Null values are invalid.
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter, AllowMultiple = false)]
public class ValidNameAttribute : ValidationAttribute
{
    public ValidNameAttribute()
        : base("The {0} field must contain only letters, digits, hyphens, underscores, periods, or colons.")
    {
    }

    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is null)
        {
            return ValidationResult.Success;
        }

        if (value is not string name)
        {
            return new ValidationResult(FormatErrorMessage(validationContext.DisplayName));
        }

        if (name.Length > Ext.MaxNameLength)
        {
            return new ValidationResult($"The {validationContext.DisplayName} field must be {Ext.MaxNameLength} characters or fewer.");
        }

        if (!name.IsValidName())
        {
            return new ValidationResult(FormatErrorMessage(validationContext.DisplayName));
        }

        return ValidationResult.Success;
    }

    public override bool IsValid(object? value)
    {
        if (value is null)
        {
            return true;
        }

        return value is string name && name.IsValidName();
    }
}
