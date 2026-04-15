using System.ComponentModel.DataAnnotations;
using Newtonsoft.Json;

namespace Catalog;

public class Project
{
    [JsonProperty("name", Required = Required.Always)]
    [Required, ValidName, ValidProjectName]
    public required string Name { get; set; }
}