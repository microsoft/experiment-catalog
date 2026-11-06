using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;

namespace Catalog;

public static class CustomLinkConfiguration
{
    public static IList<CustomLink> FromEnvironment(IDictionary environment)
    {
        var links = new List<CustomLink>();
        foreach (DictionaryEntry entry in environment)
        {
            if (entry.Key is not string key) continue;
            foreach (var scope in new[] { "iteration", "ref", "set", "experiment" })
            {
                var prefix = $"{scope.ToUpperInvariant()}_LINK_";
                if (!key.StartsWith(prefix, StringComparison.Ordinal)) continue;
                links.Add(new CustomLink
                {
                    Scope = scope,
                    Name = key[prefix.Length..],
                    Url = entry.Value?.ToString() ?? "",
                });
                break;
            }
        }

        Validate(links);
        return links.OrderBy(link => link.Scope, StringComparer.Ordinal)
            .ThenBy(link => link.Name, StringComparer.Ordinal).ToList();
    }

    public static void Validate(IList<CustomLink> links)
    {
        var keys = new HashSet<(string, string)>();
        foreach (var link in links)
        {
            if (link is null) throw new ValidationException("Link definitions cannot be null.");
            Validator.ValidateObject(link, new ValidationContext(link), validateAllProperties: true);
            if (!keys.Add((link.Scope, link.Name)))
            {
                throw new ValidationException($"Duplicate {link.Scope} link name: {link.Name}.");
            }
        }
    }
}
