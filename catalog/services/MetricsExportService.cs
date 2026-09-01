using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace Catalog;

public static class MetricsExportService
{
    public static async Task<IReadOnlyList<MetricsExportRow>> GetRowsAsync(
        IStorageService storageService,
        string projectName,
        string experimentName,
        string? setName = null,
        CancellationToken cancellationToken = default)
    {
        var experiment = await storageService.GetExperimentAsync(
            projectName,
            experimentName,
            cancellationToken: cancellationToken);

        return CreateRows(experiment, setName);
    }

    public static IReadOnlyList<MetricsExportRow> CreateRows(
        Experiment experiment,
        string? setName = null)
    {
        var rows = new List<MetricsExportRow>();
        var iterations = new Dictionary<(string Set, string Ref), int>();

        foreach (var result in experiment.Results ?? [])
        {
            if (string.IsNullOrEmpty(result.Set) ||
                string.IsNullOrEmpty(result.Ref) ||
                result.Metrics is null ||
                (setName is not null && result.Set != setName))
            {
                continue;
            }

            var metrics = result.Metrics
                .Select(metric => (metric.Key, Value: GetRawValue(metric.Value)))
                .Where(metric => metric.Value is not null)
                .ToDictionary(metric => metric.Key, metric => metric.Value!);

            if (metrics.Count == 0) continue;

            var key = (result.Set, result.Ref);
            iterations.TryGetValue(key, out var iteration);
            iteration++;
            iterations[key] = iteration;

            rows.Add(new MetricsExportRow
            {
                Set = result.Set,
                Ref = result.Ref,
                Iteration = iteration,
                Metrics = metrics,
            });
        }

        return rows;
    }

    public static string ToCsv(IReadOnlyList<MetricsExportRow> rows)
    {
        var metricNames = rows
            .SelectMany(row => row.Metrics.Keys)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToList();
        var metricColumns = metricNames.SelectMany(metricName =>
        {
            var values = rows
                .Where(row => row.Metrics.ContainsKey(metricName))
                .Select(row => row.Metrics[metricName])
                .ToList();
            var columns = new List<CsvMetricColumn>();
            if (values.Any(value => value is not RetrievalValue))
            {
                var header = metricName is "set" or "ref" or "iteration"
                    ? $"metric.{metricName}"
                    : metricName;
                columns.Add(new CsvMetricColumn(header, metricName, RetrievalPart.None));
            }
            if (values.Any(value => value is RetrievalValue))
            {
                columns.Add(new CsvMetricColumn($"{metricName}.found", metricName, RetrievalPart.Found));
                columns.Add(new CsvMetricColumn($"{metricName}.expected", metricName, RetrievalPart.Expected));
            }
            return columns;
        }).ToList();
        var output = new StringBuilder();

        WriteCsvRow(output, ["set", "ref", "iteration", .. metricColumns.Select(column => column.Header)]);
        foreach (var row in rows)
        {
            var values = new List<string>
            {
                row.Set,
                row.Ref,
                row.Iteration.ToString(CultureInfo.InvariantCulture),
            };
            values.AddRange(metricColumns.Select(column => GetCsvMetricValue(row, column)));
            WriteCsvRow(output, values);
        }

        return output.ToString();
    }

    private static object? GetRawValue(Metric metric)
    {
        if (metric.Value.HasValue) return metric.Value.Value;
        if (metric.Classification is not null) return metric.Classification;
        return metric.Retrieval;
    }

    private static string GetCsvMetricValue(MetricsExportRow row, CsvMetricColumn column)
    {
        if (!row.Metrics.TryGetValue(column.MetricName, out var value)) return string.Empty;
        if (column.RetrievalPart == RetrievalPart.None)
        {
            return value is RetrievalValue
                ? string.Empty
                : Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty;
        }
        if (value is not RetrievalValue retrieval) return string.Empty;

        return JsonConvert.SerializeObject(
            column.RetrievalPart == RetrievalPart.Found
                ? retrieval.Found
                : retrieval.Expected);
    }

    private static void WriteCsvRow(StringBuilder output, IEnumerable<string> values)
    {
        output.AppendJoin(',', values.Select(EscapeCsvValue));
        output.AppendLine();
    }

    private static string EscapeCsvValue(string value)
    {
        if (!value.Contains(',') && !value.Contains('"') &&
            !value.Contains('\r') && !value.Contains('\n'))
        {
            return value;
        }

        return $"\"{value.Replace("\"", "\"\"")}\"";
    }

    private enum RetrievalPart
    {
        None,
        Found,
        Expected,
    }

    private sealed record CsvMetricColumn(
        string Header,
        string MetricName,
        RetrievalPart RetrievalPart);
}
