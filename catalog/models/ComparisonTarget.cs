using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace Catalog;

public record ComparisonTarget(
    [property: JsonProperty("project"), Required, ValidProjectName] string Project,
    [property: JsonProperty("experiment"), Required, ValidExperimentName] string Experiment,
    [property: JsonProperty("set"), Required, ValidName] string Set);
