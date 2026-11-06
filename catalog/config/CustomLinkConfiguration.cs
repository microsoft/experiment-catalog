using System;
using System.Collections;
using System.Collections.Generic;
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

        CustomLink.ValidateDefinitions(links);
        return links.OrderBy(link => link.Scope, StringComparer.Ordinal)
            .ThenBy(link => link.Name, StringComparer.Ordinal).ToList();
    }
}
