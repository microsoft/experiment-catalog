using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Newtonsoft.Json;

namespace Catalog;

public class CalculateStatisticsRequest
{
    [JsonProperty("project", Required = Required.Always)]
    [Required, ValidName, ValidProjectName]
    public required string Project { get; set; }

    [JsonProperty("experiment", Required = Required.Always)]
    [Required, ValidName, ValidExperimentName]
    public required string Experiment { get; set; }
}