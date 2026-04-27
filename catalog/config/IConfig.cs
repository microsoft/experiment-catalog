namespace Catalog;

public interface IConfig
{
    int PORT { get; set; }
    string? OPEN_TELEMETRY_CONNECTION_STRING { get; set; }
    string? AZURE_STORAGE_ACCOUNT_NAME { get; set; }
    string? AZURE_STORAGE_ACCOUNT_CONNSTRING { get; set; }
    int CONCURRENCY { get; set; }
    int REQUIRED_BLOCK_SIZE_IN_KB_FOR_OPTIMIZE { get; set; }
    int MINUTES_TO_BE_IDLE { get; set; }
    int MINUTES_TO_BE_RECENT { get; set; }
    int CALC_PVALUES_USING_X_SAMPLES { get; set; }
    int CALC_PVALUES_EVERY_X_MINUTES { get; set; }
    int MIN_ITERATIONS_TO_CALC_PVALUES { get; set; }
    decimal CONFIDENCE_LEVEL { get; set; }
    int PRECISION_FOR_CALC_VALUES { get; set; }
    string? PATH_TEMPLATE { get; set; }
    string? AZURE_STORAGE_ACCOUNT_NAME_FOR_SUPPORT_DOCS { get; set; }
    string? AZURE_STORAGE_ACCOUNT_CONNSTRING_FOR_SUPPORT_DOCS { get; set; }
    string? AZURE_STORAGE_CACHE_FOLDER { get; set; }
    int AZURE_STORAGE_CACHE_MAX_AGE_IN_HOURS { get; set; }
    int AZURE_STORAGE_OPTIMIZE_EVERY_X_MINUTES { get; set; }
    int AZURE_STORAGE_CACHE_CLEANUP_EVERY_X_MINUTES { get; set; }
    bool ENABLE_DOWNLOAD { get; set; }
    string[]? TEST_PROJECTS { get; set; }
    string? OIDC_AUTHORITY { get; set; }
    string? OIDC_CLIENT_ID { get; set; }
    string? OIDC_CLIENT_SECRET { get; set; }
    string[]? OIDC_AUDIENCES { get; set; }
    string[]? OIDC_ISSUERS { get; set; }
    bool OIDC_VALIDATE_LIFETIME { get; set; }
    int OIDC_CLOCK_SKEW_IN_MINUTES { get; set; }
    string? OIDC_NAME_CLAIM_TYPE { get; set; }
    string? OIDC_ROLE_CLAIM_TYPE { get; set; }
    string? OIDC_VALIDATE_HEADER { get; set; }
    string? OIDC_VALIDATE_COOKIE { get; set; }
    string[]? OIDC_ACCEPTABLE_ROLES { get; set; }
    bool IsAuthenticationEnabled { get; }
}