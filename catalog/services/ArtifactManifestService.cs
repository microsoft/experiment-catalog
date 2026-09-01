using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace Catalog;

public static class ArtifactManifestService
{
    public static readonly IReadOnlySet<string> SupportedTypes =
        new HashSet<string>(["inference", "evaluation"], StringComparer.OrdinalIgnoreCase);

    public static async Task<IReadOnlyList<ArtifactManifestRow>> GetRowsAsync(
        IStorageService storageService,
        string projectName,
        string experimentName,
        IReadOnlySet<string> types,
        string? setName = null,
        CancellationToken cancellationToken = default)
    {
        var experiment = await storageService.GetExperimentAsync(
            projectName,
            experimentName,
            cancellationToken: cancellationToken);

        return CreateRows(experiment, types, setName);
    }

    public static IReadOnlyList<ArtifactManifestRow> CreateRows(
        Experiment experiment,
        IReadOnlySet<string> types,
        string? setName = null)
    {
        var rows = new List<ArtifactManifestRow>();
        var iterations = new Dictionary<(string Set, string Ref), int>();
        var seen = new HashSet<(string Type, string Uri)>();

        foreach (var result in experiment.Results ?? [])
        {
            if (string.IsNullOrEmpty(result.Set) ||
                string.IsNullOrEmpty(result.Ref) ||
                (setName is not null && result.Set != setName))
            {
                continue;
            }

            var key = (result.Set, result.Ref);
            iterations.TryGetValue(key, out var iteration);
            iteration++;
            iterations[key] = iteration;

            AddArtifact(
                rows,
                seen,
                types,
                "inference",
                result.InferenceUri,
                result.Set,
                result.Ref,
                iteration);
            AddArtifact(
                rows,
                seen,
                types,
                "evaluation",
                result.EvaluationUri,
                result.Set,
                result.Ref,
                iteration);
        }

        return rows;
    }

    public static string ToJsonLines(IReadOnlyList<ArtifactManifestRow> rows) =>
        string.Join(
            Environment.NewLine,
            rows.Select(JsonConvert.SerializeObject)) +
        (rows.Count > 0 ? Environment.NewLine : string.Empty);

    private static void AddArtifact(
        List<ArtifactManifestRow> rows,
        HashSet<(string Type, string Uri)> seen,
        IReadOnlySet<string> types,
        string type,
        string? uri,
        string set,
        string reference,
        int iteration)
    {
        if (!types.Contains(type) || string.IsNullOrWhiteSpace(uri) || !seen.Add((type, uri)))
        {
            return;
        }

        rows.Add(new ArtifactManifestRow
        {
            Type = type,
            Set = set,
            Ref = reference,
            Iteration = iteration,
            Uri = uri,
        });
    }
}
