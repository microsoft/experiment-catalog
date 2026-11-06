using System.Collections.Generic;
using Newtonsoft.Json;

namespace Catalog;

public class UiSettings
{
    [JsonProperty("show_only_important_metrics_by_default")]
    public bool ShowOnlyImportantMetricsByDefault { get; set; }

    [JsonProperty("custom_links")]
    public IList<CustomLink> CustomLinks { get; set; } = new List<CustomLink>();
}
