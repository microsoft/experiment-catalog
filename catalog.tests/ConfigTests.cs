using System.Collections.Generic;
using Catalog;
using Xunit;

namespace Catalog.Tests;

public class ConfigTests
{
    private const string MainAccountName = "mainaccount";
    private const string MainConnectionString = "DefaultEndpointsProtocol=https;AccountName=mainaccount;AccountKey=ZmFrZUtleQ==;EndpointSuffix=core.windows.net";
    private const string SupportDocsAccountName = "supportdocsaccount";
    private const string SupportDocsConnectionString = "DefaultEndpointsProtocol=https;AccountName=supportdocsaccount;AccountKey=ZmFrZUtleQ==;EndpointSuffix=core.windows.net";

    [Theory]
    [MemberData(nameof(SupportDocsStorageDefaultData))]
    public void ApplySupportDocsStorageDefaults_PreservesIndependentAuthOptions(
        string? mainAccountName,
        string? mainConnectionString,
        string? supportDocsAccountName,
        string? supportDocsConnectionString,
        string? expectedSupportDocsAccountName,
        string? expectedSupportDocsConnectionString)
    {
        var config = new Config
        {
            AZURE_STORAGE_ACCOUNT_NAME = mainAccountName,
            AZURE_STORAGE_ACCOUNT_CONNSTRING = mainConnectionString,
            AZURE_STORAGE_ACCOUNT_NAME_FOR_SUPPORT_DOCS = supportDocsAccountName,
            AZURE_STORAGE_ACCOUNT_CONNSTRING_FOR_SUPPORT_DOCS = supportDocsConnectionString
        };

        config.ApplySupportDocsStorageDefaults();

        Assert.Equal(expectedSupportDocsAccountName, config.AZURE_STORAGE_ACCOUNT_NAME_FOR_SUPPORT_DOCS);
        Assert.Equal(expectedSupportDocsConnectionString, config.AZURE_STORAGE_ACCOUNT_CONNSTRING_FOR_SUPPORT_DOCS);
    }

    public static IEnumerable<object?[]> SupportDocsStorageDefaultData()
    {
        yield return new object?[]
        {
            MainAccountName,
            null,
            null,
            null,
            MainAccountName,
            null
        };

        yield return new object?[]
        {
            null,
            MainConnectionString,
            null,
            null,
            null,
            MainConnectionString
        };

        yield return new object?[]
        {
            MainAccountName,
            null,
            SupportDocsAccountName,
            null,
            SupportDocsAccountName,
            null
        };

        yield return new object?[]
        {
            MainAccountName,
            null,
            null,
            SupportDocsConnectionString,
            null,
            SupportDocsConnectionString
        };

        yield return new object?[]
        {
            null,
            MainConnectionString,
            SupportDocsAccountName,
            null,
            SupportDocsAccountName,
            null
        };

        yield return new object?[]
        {
            null,
            MainConnectionString,
            null,
            SupportDocsConnectionString,
            null,
            SupportDocsConnectionString
        };
    }
}
