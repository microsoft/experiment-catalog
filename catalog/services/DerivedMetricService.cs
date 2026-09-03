using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using NetBricks;
using Newtonsoft.Json;

namespace Catalog;

public class DerivedMetricService(
    ILogger<DerivedMetricService> logger,
    IConfigFactory<IConfig> configFactory) : IDerivedMetricService
{
    private const int MaximumErrorDetailLength = 4000;

    public async Task ApplyAsync(
        IReadOnlyCollection<DerivedMetricGroup> groups,
        IReadOnlyDictionary<string, MetricDefinition> metricDefinitions,
        CancellationToken cancellationToken = default)
    {
        if (groups.Count == 0) return;

        var config = await configFactory.GetAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(config.CUSTOM_AGGREGATE_FUNCTIONS_PATH)) return;

        await ApplyAsync(
            groups,
            metricDefinitions,
            config.CUSTOM_AGGREGATE_FUNCTIONS_PATH,
            config.CUSTOM_AGGREGATE_PYTHON_EXECUTABLE,
            TimeSpan.FromSeconds(config.CUSTOM_AGGREGATE_TIMEOUT_SECONDS),
            cancellationToken);
    }

    public async Task ApplyAsync(
        IReadOnlyCollection<DerivedMetricGroup> groups,
        IReadOnlyDictionary<string, MetricDefinition> metricDefinitions,
        string functionsPath,
        string pythonExecutable,
        TimeSpan timeout,
        CancellationToken cancellationToken = default)
    {
        var duplicateGroupId = groups
            .GroupBy(group => group.Id, StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1)
            ?.Key;
        if (duplicateGroupId is not null)
        {
            throw new HttpException(
                500,
                $"Custom aggregate execution received duplicate group '{duplicateGroupId}'.");
        }
        if (!Directory.Exists(functionsPath))
        {
            throw new HttpException(
                500,
                $"Custom aggregate function folder does not exist: {functionsPath}");
        }

        var runnerPath = Path.Combine(
            AppContext.BaseDirectory,
            "aggregate-runtime",
            "aggregate_runner.py");
        if (!File.Exists(runnerPath))
        {
            throw new HttpException(500, "Custom aggregate Python runner is missing.");
        }

        var payload = new RunnerRequest
        {
            Groups = groups.Select(group => new RunnerGroup
            {
                Id = group.Id,
                Results = group.Results.Select(ToRunnerResult).ToList(),
            }).ToList(),
        };

        var startInfo = new ProcessStartInfo
        {
            FileName = pythonExecutable,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        startInfo.ArgumentList.Add(runnerPath);
        startInfo.ArgumentList.Add(Path.GetFullPath(functionsPath));

        using var process = new Process { StartInfo = startInfo };
        var stopwatch = Stopwatch.StartNew();
        try
        {
            if (!process.Start())
            {
                throw new HttpException(500, "Failed to start custom aggregate Python process.");
            }
        }
        catch (Exception error) when (error is Win32Exception or InvalidOperationException)
        {
            throw new HttpException(
                500,
                $"Failed to start custom aggregate Python process: {error.Message}");
        }

        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        try
        {
            await process.StandardInput.WriteAsync(
                JsonConvert.SerializeObject(payload).AsMemory(),
                timeoutSource.Token);
            process.StandardInput.Close();
            await process.WaitForExitAsync(timeoutSource.Token);
            await Task.WhenAll(stdoutTask, stderrTask).WaitAsync(timeoutSource.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            KillProcess(process);
            await CompleteAfterKillAsync(process, stdoutTask, stderrTask);
            logger.LogError(
                "custom aggregate execution timed out after {TimeoutSeconds} seconds.",
                timeout.TotalSeconds);
            throw new HttpException(
                500,
                $"Custom aggregate execution exceeded {timeout.TotalSeconds.ToString(CultureInfo.InvariantCulture)} seconds.");
        }
        catch (OperationCanceledException)
        {
            KillProcess(process);
            await CompleteAfterKillAsync(process, stdoutTask, stderrTask);
            throw;
        }
        catch (Exception error) when (error is IOException or InvalidOperationException)
        {
            KillProcess(process);
            await CompleteAfterKillAsync(process, stdoutTask, stderrTask);
            throw new HttpException(
                500,
                $"Custom aggregate execution failed while communicating with Python: {error.Message}");
        }

        var stdout = await stdoutTask;
        var stderr = await stderrTask;
        stopwatch.Stop();

        if (process.ExitCode != 0)
        {
            var detail = string.IsNullOrWhiteSpace(stderr)
                ? "Python process exited without an error message."
                : Truncate(stderr.Trim());
            throw new HttpException(500, $"Custom aggregate execution failed: {detail}");
        }

        RunnerResponse? response;
        try
        {
            response = JsonConvert.DeserializeObject<RunnerResponse>(stdout);
        }
        catch (JsonException error)
        {
            throw new HttpException(
                500,
                $"Custom aggregate execution returned invalid JSON: {error.Message}");
        }
        if (response?.Groups is null)
        {
            throw new HttpException(500, "Custom aggregate execution returned no groups.");
        }

        ApplyResponse(groups, metricDefinitions, response);
        logger.LogInformation(
            "custom aggregate execution completed for {GroupCount} groups in {DurationMs} ms.",
            groups.Count,
            stopwatch.ElapsedMilliseconds);
    }

    private static void ApplyResponse(
        IReadOnlyCollection<DerivedMetricGroup> groups,
        IReadOnlyDictionary<string, MetricDefinition> metricDefinitions,
        RunnerResponse response)
    {
        var groupsById = groups.ToDictionary(group => group.Id, StringComparer.Ordinal);
        foreach (var (groupId, metrics) in response.Groups)
        {
            if (!groupsById.TryGetValue(groupId, out var group))
            {
                throw new HttpException(
                    500,
                    $"Custom aggregate execution returned unknown group '{groupId}'.");
            }

            group.Target.Metrics ??= new Dictionary<string, Metric>();
            foreach (var (metricName, value) in metrics)
            {
                if (!metricName.IsValidName())
                {
                    throw new HttpException(
                        500,
                        $"Custom aggregate execution returned invalid metric name '{metricName}'.");
                }
                if (group.Target.Metrics.ContainsKey(metricName))
                {
                    throw new HttpException(
                        500,
                        $"Custom aggregate metric '{metricName}' conflicts with an existing metric.");
                }

                decimal? normalized = null;
                if (metricDefinitions.TryGetValue(metricName, out var definition) &&
                    definition.TryNormalize(value, out var normalizedValue))
                {
                    normalized = normalizedValue;
                }
                group.Target.Metrics[metricName] = new Metric
                {
                    Value = value,
                    Normalized = normalized,
                    Count = group.Results.Count,
                    UniqueRefs = group.Results
                        .Where(result => !string.IsNullOrEmpty(result.Ref))
                        .Select(result => result.Ref)
                        .Distinct(StringComparer.Ordinal)
                        .Count(),
                };
            }
        }

        var missingGroups = groupsById.Keys.Except(response.Groups.Keys, StringComparer.Ordinal);
        if (missingGroups.Any())
        {
            throw new HttpException(
                500,
                $"Custom aggregate execution omitted group '{missingGroups.First()}'.");
        }
    }

    private static RunnerResult ToRunnerResult(Result result)
    {
        var metrics = new Dictionary<string, object?>();
        if (result.Metrics is not null)
        {
            foreach (var (name, metric) in result.Metrics)
            {
                metrics[name] = metric.Value is not null
                    ? metric.Value
                    : metric.Classification is not null
                        ? metric.Classification
                        : metric.Retrieval is not null
                            ? new
                            {
                                found = metric.Retrieval.Found,
                                expected = metric.Retrieval.Expected,
                            }
                            : null;
            }
        }

        return new RunnerResult
        {
            Ref = result.Ref,
            Set = result.Set,
            GroundTruthUri = result.GroundTruthUri,
            InferenceUri = result.InferenceUri,
            EvaluationUri = result.EvaluationUri,
            Metrics = metrics,
        };
    }

    private static void KillProcess(Process process)
    {
        if (!OperatingSystem.IsWindows())
        {
            _ = kill(-process.Id, 9);
        }
        try
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException)
        {
        }
    }

    private static async Task AwaitExitAsync(Process process)
    {
        try
        {
            await process.WaitForExitAsync(CancellationToken.None);
        }
        catch (InvalidOperationException)
        {
        }
    }

    private static async Task CompleteAfterKillAsync(
        Process process,
        Task<string> stdoutTask,
        Task<string> stderrTask)
    {
        await AwaitExitAsync(process);
        try
        {
            await Task.WhenAll(stdoutTask, stderrTask).WaitAsync(TimeSpan.FromSeconds(1));
        }
        catch (TimeoutException)
        {
        }
    }

    [DllImport("libc", SetLastError = true)]
    private static extern int kill(int processId, int signal);

    private static string Truncate(string value) =>
        value.Length <= MaximumErrorDetailLength
            ? value
            : string.Concat(value.AsSpan(0, MaximumErrorDetailLength), "...");

    private sealed class RunnerRequest
    {
        [JsonProperty("groups")]
        public required List<RunnerGroup> Groups { get; init; }
    }

    private sealed class RunnerGroup
    {
        [JsonProperty("id")]
        public required string Id { get; init; }

        [JsonProperty("results")]
        public required List<RunnerResult> Results { get; init; }
    }

    private sealed class RunnerResult
    {
        [JsonProperty("ref", NullValueHandling = NullValueHandling.Ignore)]
        public string? Ref { get; init; }

        [JsonProperty("set", NullValueHandling = NullValueHandling.Ignore)]
        public string? Set { get; init; }

        [JsonProperty("ground_truth_uri", NullValueHandling = NullValueHandling.Ignore)]
        public string? GroundTruthUri { get; init; }

        [JsonProperty("inference_uri", NullValueHandling = NullValueHandling.Ignore)]
        public string? InferenceUri { get; init; }

        [JsonProperty("evaluation_uri", NullValueHandling = NullValueHandling.Ignore)]
        public string? EvaluationUri { get; init; }

        [JsonProperty("metrics")]
        public required Dictionary<string, object?> Metrics { get; init; }
    }

    private sealed class RunnerResponse
    {
        [JsonProperty("groups")]
        public required Dictionary<string, Dictionary<string, decimal>> Groups { get; init; }
    }
}
