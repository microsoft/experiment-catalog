using System.Collections.Generic;

namespace Catalog;

/// <summary>
/// Provides validation methods for MCP tool parameters, matching the validation
/// performed by the API controllers via <see cref="ValidNameAttribute"/>,
/// <see cref="ValidProjectNameAttribute"/>, and <see cref="ValidExperimentNameAttribute"/>.
/// </summary>
public static class McpValidationHelper
{
    /// <summary>
    /// Validates that a required string parameter is not null or empty and is a valid name.
    /// </summary>
    /// <param name="value">The value to validate.</param>
    /// <param name="parameterName">The parameter name for error messages.</param>
    /// <exception cref="HttpException">Thrown when validation fails.</exception>
    public static void ValidateRequiredName(string? value, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new HttpException(400, $"The {parameterName} field is required.");
        }

        if (!value.IsValidName())
        {
            throw new HttpException(400, $"The {parameterName} field must contain only letters, digits, hyphens, underscores, periods, or colons (3-50 characters).");
        }
    }

    /// <summary>
    /// Validates a required project name using both name format and storage-specific rules.
    /// </summary>
    /// <param name="value">The project name to validate.</param>
    /// <param name="storageService">The storage service for project-specific validation.</param>
    /// <exception cref="HttpException">Thrown when validation fails.</exception>
    public static void ValidateProjectName(string? value, IStorageService storageService)
    {
        ValidateRequiredName(value, "project");

        if (!storageService.TryValidProjectName(value, out string? errorMessage))
        {
            throw new HttpException(400, errorMessage ?? "The project name is invalid.");
        }
    }

    /// <summary>
    /// Validates a required experiment name using both name format and storage-specific rules.
    /// </summary>
    /// <param name="value">The experiment name to validate.</param>
    /// <param name="storageService">The storage service for experiment-specific validation.</param>
    /// <exception cref="HttpException">Thrown when validation fails.</exception>
    public static void ValidateExperimentName(string? value, IStorageService storageService)
    {
        ValidateRequiredName(value, "experiment");

        if (!storageService.TryValidExperimentName(value, out string? errorMessage))
        {
            throw new HttpException(400, errorMessage ?? "The experiment name is invalid.");
        }
    }

    /// <summary>
    /// Validates an optional collection of names, ensuring each is a valid name if provided.
    /// </summary>
    /// <param name="values">The collection of names to validate.</param>
    /// <param name="parameterName">The parameter name for error messages.</param>
    /// <exception cref="HttpException">Thrown when any name in the collection is invalid.</exception>
    public static void ValidateOptionalNames(IEnumerable<string>? values, string parameterName)
    {
        if (values is null)
        {
            return;
        }

        foreach (var value in values)
        {
            if (!value.IsValidName())
            {
                throw new HttpException(400, $"The {parameterName} field contains an invalid name '{value}'. Names must contain only letters, digits, hyphens, underscores, periods, or colons (3-50 characters).");
            }
        }
    }
}
