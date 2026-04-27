using System;
using System.ComponentModel.DataAnnotations;

namespace Catalog;

/// <summary>
/// Validates that a string is a valid name containing only letters, digits, hyphens, underscores, periods, and colons.
/// Null values are invalid.
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter, AllowMultiple = false)]
public class ValidExperimentNameAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        // use [Required] to enforce non-null if needed
        if (value is null)
        {
            return ValidationResult.Success;
        }

        // ensure storage service is available to get naming rules
        var storageService = validationContext.GetService(typeof(IStorageService)) as IStorageService;
        if (storageService is null)
        {
            return new ValidationResult("there is no storage service available.");
        }

        // validate the experiment name
        if (!storageService.TryValidExperimentName(value as string, out string? errorMessage))
        {
            return new ValidationResult(errorMessage);
        }

        return ValidationResult.Success;
    }
}
