using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace Catalog;

public class CustomLink : IValidatableObject
{
    [JsonProperty("scope", Required = Required.Always)]
    public string Scope { get; set; } = "";

    [JsonProperty("name", Required = Required.Always)]
    public string Name { get; set; } = "";

    [JsonProperty("url", Required = Required.Always)]
    public string Url { get; set; } = "";

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        var placeholders = new HashSet<string>(StringComparer.Ordinal)
        {
            "project", "experiment", "baseline-project", "baseline-experiment", "baseline-set",
        };
        switch (Scope)
        {
            case "iteration":
                placeholders.UnionWith(["gt", "inf", "eval"]);
                goto case "ref";
            case "ref":
                placeholders.Add("ref");
                goto case "set";
            case "set":
                placeholders.Add("set");
                break;
            case "experiment":
                break;
            default:
                yield return new ValidationResult("Link scope must be iteration, ref, set, or experiment.");
                break;
        }

        if (string.IsNullOrWhiteSpace(Name))
        {
            yield return new ValidationResult("A link name is required.");
        }

        if (string.IsNullOrWhiteSpace(Url))
        {
            yield return new ValidationResult("A link URL is required.");
            yield break;
        }

        foreach (Match match in Regex.Matches(Url, @"\{([^{}]*)\}"))
        {
            if (!placeholders.Contains(match.Groups[1].Value))
            {
                yield return new ValidationResult($"Unsupported placeholder {match.Value} for {Scope} links.");
            }
        }

        var expanded = Regex.Replace(Url, @"\{[^{}]*\}", "value");
        if (expanded.Contains('{') || expanded.Contains('}') ||
            !Uri.TryCreate(expanded, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
        {
            yield return new ValidationResult("Link URLs must be absolute HTTP(S) URL templates with balanced placeholders.");
        }
    }
}
