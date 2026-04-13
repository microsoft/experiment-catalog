using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using NetBricks;

namespace Catalog;

[LogConfig("Configuration:")]
public class Config : IConfig, IValidatableObject
{
    [SetValue("PORT")]
    public int PORT { get; set; } = 6010;

    [SetValue("OPEN_TELEMETRY_CONNECTION_STRING")]
    [ResolveSecret]
    [LogConfig(mode: LogConfigMode.Masked)]
    public string? OPEN_TELEMETRY_CONNECTION_STRING { get; set; }

    [SetValue("AZURE_STORAGE_ACCOUNT_NAME")]
    public string? AZURE_STORAGE_ACCOUNT_NAME { get; set; }

    [SetValue("AZURE_STORAGE_ACCOUNT_CONNSTRING")]
    [ResolveSecret]
    [LogConfig(mode: LogConfigMode.Masked)]
    public string? AZURE_STORAGE_ACCOUNT_CONNSTRING { get; set; }

    [SetValue("CONCURRENCY")]
    [Range(1, 100)]
    public int CONCURRENCY { get; set; } = 4;

    [SetValue("REQUIRED_BLOCK_SIZE_IN_KB_FOR_OPTIMIZE")]
    public int REQUIRED_BLOCK_SIZE_IN_KB_FOR_OPTIMIZE { get; set; } = 1024;

    [SetValue("MINUTES_TO_BE_IDLE")]
    public int MINUTES_TO_BE_IDLE { get; set; } = 10;

    [SetValue("MINUTES_TO_BE_RECENT")]
    public int MINUTES_TO_BE_RECENT { get; set; } = 480; // 8 hours

    [SetValue("CALC_PVALUES_USING_X_SAMPLES")]
    public int CALC_PVALUES_USING_X_SAMPLES { get; set; } = 10000;

    [SetValue("CALC_PVALUES_EVERY_X_MINUTES")]
    public int CALC_PVALUES_EVERY_X_MINUTES { get; set; } = 0;

    [SetValue("MIN_ITERATIONS_TO_CALC_PVALUES")]
    public int MIN_ITERATIONS_TO_CALC_PVALUES { get; set; } = 5;

    [SetValue("CONFIDENCE_LEVEL")]
    public decimal CONFIDENCE_LEVEL { get; set; } = 0.95m;

    [SetValue("PRECISION_FOR_CALC_VALUES")]
    public int PRECISION_FOR_CALC_VALUES { get; set; } = 4;

    [SetValue("PATH_TEMPLATE")]
    public string? PATH_TEMPLATE { get; set; }

    [SetValue("AZURE_STORAGE_ACCOUNT_NAME_FOR_SUPPORT_DOCS", "AZURE_STORAGE_ACCOUNT_NAME")]
    public string? AZURE_STORAGE_ACCOUNT_NAME_FOR_SUPPORT_DOCS { get; set; }

    [SetValue("AZURE_STORAGE_ACCOUNT_CONNSTRING_FOR_SUPPORT_DOCS", "AZURE_STORAGE_ACCOUNT_CONNSTRING")]
    [ResolveSecret]
    [LogConfig(mode: LogConfigMode.Masked)]
    public string? AZURE_STORAGE_ACCOUNT_CONNSTRING_FOR_SUPPORT_DOCS { get; set; }

    [SetValue("AZURE_STORAGE_CACHE_FOLDER")]
    public string? AZURE_STORAGE_CACHE_FOLDER { get; set; }

    [SetValue("AZURE_STORAGE_CACHE_MAX_AGE_IN_HOURS")]
    public int AZURE_STORAGE_CACHE_MAX_AGE_IN_HOURS { get; set; } = 168;

    [SetValue("AZURE_STORAGE_OPTIMIZE_EVERY_X_MINUTES")]
    public int AZURE_STORAGE_OPTIMIZE_EVERY_X_MINUTES { get; set; } = 0;

    [SetValue("AZURE_STORAGE_CACHE_CLEANUP_EVERY_X_MINUTES")]
    public int AZURE_STORAGE_CACHE_CLEANUP_EVERY_X_MINUTES { get; set; } = 120;

    [SetValue("ENABLE_DOWNLOAD")]
    public bool ENABLE_DOWNLOAD { get; set; } = false;

    [SetValue("TEST_PROJECTS")]
    public string[]? TEST_PROJECTS { get; set; }

    [SetValue("OIDC_AUTHORITY")]
    public string? OIDC_AUTHORITY { get; set; }

    [SetValue("OIDC_CLIENT_ID")]
    public string? OIDC_CLIENT_ID { get; set; }

    [SetValue("OIDC_CLIENT_SECRET")]
    [ResolveSecret]
    [LogConfig(mode: LogConfigMode.Masked)]
    public string? OIDC_CLIENT_SECRET { get; set; }

    [SetValue("OIDC_AUDIENCES")]
    public string[]? OIDC_AUDIENCES { get; set; }

    [SetValue("OIDC_ISSUERS")]
    public string[]? OIDC_ISSUERS { get; set; }

    [SetValue("OIDC_VALIDATE_LIFETIME")]
    public bool OIDC_VALIDATE_LIFETIME { get; set; } = true;

    [SetValue("OIDC_CLOCK_SKEW_IN_MINUTES")]
    public int OIDC_CLOCK_SKEW_IN_MINUTES { get; set; } = 5;

    [SetValue("OIDC_NAME_CLAIM_TYPE")]
    public string? OIDC_NAME_CLAIM_TYPE { get; set; } = "name";

    [SetValue("OIDC_ROLE_CLAIM_TYPE")]
    public string? OIDC_ROLE_CLAIM_TYPE { get; set; } = "roles";

    [SetValue("OIDC_VALIDATE_HEADER")]
    public string? OIDC_VALIDATE_HEADER { get; set; } = "X-MS-TOKEN-AAD-ID-TOKEN";

    [SetValue("OIDC_VALIDATE_COOKIE")]
    public string? OIDC_VALIDATE_COOKIE { get; set; } = "id_token";

    [SetValue("OIDC_ACCEPTABLE_ROLES")]
    public string[]? OIDC_ACCEPTABLE_ROLES { get; set; }

    public bool IsAuthenticationEnabled => string.IsNullOrEmpty(OIDC_AUTHORITY) == false;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (string.IsNullOrEmpty(AZURE_STORAGE_ACCOUNT_NAME) && string.IsNullOrEmpty(AZURE_STORAGE_ACCOUNT_CONNSTRING))
        {
            yield return new ValidationResult(
                "Either AZURE_STORAGE_ACCOUNT_NAME or AZURE_STORAGE_ACCOUNT_CONNSTRING must be set.",
                new[] { nameof(AZURE_STORAGE_ACCOUNT_NAME), nameof(AZURE_STORAGE_ACCOUNT_CONNSTRING) });
        }
    }
}