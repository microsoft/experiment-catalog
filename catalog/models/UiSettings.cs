using Newtonsoft.Json;

namespace Catalog;

public class UiSettings
{
    [JsonProperty("show_only_important_metrics_by_default")]
    public bool ShowOnlyImportantMetricsByDefault { get; set; }
}
