using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using Catalog;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Catalog.Tests;

public class DerivedMetricServiceTests
{
    [Fact]
    public async Task ApplyAsync_AddsDerivedMetricsToEveryGroup()
    {
        using var functions = new TemporaryFunctionFolder();
        functions.Write(
            "quality_score.py",
            """
            def aggregate(results):
                values = [
                    result["metrics"]["score"]
                    for result in results
                    if "score" in result["metrics"]
                ]
                return sum(values) / len(values) if values else None
            """);

        var firstTarget = new Result();
        var secondTarget = new Result();
        var groups = new List<DerivedMetricGroup>
        {
            new(
                "first",
                [CreateResult("set-a", "ref-1", 2m), CreateResult("set-a", "ref-2", 4m)],
                firstTarget),
            new(
                "second",
                [CreateResult("set-b", "ref-1", 8m)],
                secondTarget),
        };
        var definitions = new Dictionary<string, MetricDefinition>
        {
            ["quality_score"] = new()
            {
                Name = "quality_score",
                Min = 0,
                Max = 10,
            },
        };
        var service = CreateService();

        await service.ApplyAsync(
            groups,
            definitions,
            functions.Path,
            "python3",
            TimeSpan.FromSeconds(10));

        Assert.Equal(3m, firstTarget.Metrics!["quality_score"].Value);
        Assert.Equal(2, firstTarget.Metrics["quality_score"].Count);
        Assert.Equal(2, firstTarget.Metrics["quality_score"].UniqueRefs);
        Assert.Equal(0.3m, firstTarget.Metrics["quality_score"].Normalized);
        Assert.Equal(8m, secondTarget.Metrics!["quality_score"].Value);
    }

    [Fact]
    public async Task ApplyAsync_RejectsMetricNameCollisions()
    {
        using var functions = new TemporaryFunctionFolder();
        functions.Write("score.py", "def aggregate(results):\n    return 1\n");
        var target = new Result
        {
            Metrics = new Dictionary<string, Metric>
            {
                ["score"] = new() { Value = 2m },
            },
        };
        var service = CreateService();

        var exception = await Assert.ThrowsAsync<HttpException>(() =>
            service.ApplyAsync(
                [new DerivedMetricGroup("group", [CreateResult("set-a", "ref-1", 2m)], target)],
                new Dictionary<string, MetricDefinition>(),
                functions.Path,
                "python3",
                TimeSpan.FromSeconds(10)));

        Assert.Contains("conflicts with an existing metric", exception.Message);
    }

    [Fact]
    public async Task ApplyAsync_TerminatesInfiniteLoopsAtConfiguredTimeout()
    {
        using var functions = new TemporaryFunctionFolder();
        functions.Write("never_finishes.py", "def aggregate(results):\n    while True:\n        pass\n");
        var service = CreateService();
        var stopwatch = Stopwatch.StartNew();

        var exception = await Assert.ThrowsAsync<HttpException>(() =>
            service.ApplyAsync(
                [new DerivedMetricGroup("group", [CreateResult("set-a", "ref-1", 2m)], new Result())],
                new Dictionary<string, MetricDefinition>(),
                functions.Path,
                "python3",
                TimeSpan.FromMilliseconds(250)));

        stopwatch.Stop();
        Assert.Contains("exceeded", exception.Message);
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task ApplyAsync_TerminatesChildrenHoldingOutputPipesAtConfiguredTimeout()
    {
        if (OperatingSystem.IsWindows()) return;

        using var functions = new TemporaryFunctionFolder();
        var childPidPath = System.IO.Path.Combine(functions.Path, "child.pid");
        var escapedChildPidPath = childPidPath
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal);
        functions.Write(
            "spawns_child.py",
            $$"""
            import os
            import subprocess
            import sys
            import time

            CHILD_PID_PATH = "{{escapedChildPidPath}}"

            def aggregate(results):
                subprocess.Popen([
                    sys.executable,
                    "-c",
                    "import os,time; "
                    + "open(os.environ['CHILD_PID_PATH'], 'w').write(str(os.getpid())); "
                    + "time.sleep(30)",
                ], env={**os.environ, "CHILD_PID_PATH": CHILD_PID_PATH})
                while not os.path.exists(CHILD_PID_PATH):
                    time.sleep(0.01)
                return 1
            """);
        var service = CreateService();
        var stopwatch = Stopwatch.StartNew();

        int? childPid = null;
        try
        {
            var exception = await Assert.ThrowsAsync<HttpException>(() =>
                service.ApplyAsync(
                    [new DerivedMetricGroup("group", [CreateResult("set-a", "ref-1", 2m)], new Result())],
                    new Dictionary<string, MetricDefinition>(),
                    functions.Path,
                    "python3",
                    TimeSpan.FromMilliseconds(250)));

            stopwatch.Stop();
            Assert.Contains("exceeded", exception.Message);
            Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(5));

            childPid = int.Parse(await File.ReadAllTextAsync(childPidPath));
            for (var attempt = 0; attempt < 20 && IsProcessRunning(childPid.Value); attempt++)
            {
                await Task.Delay(50);
            }
            Assert.False(IsProcessRunning(childPid.Value), "The aggregate child process survived the timeout.");
        }
        finally
        {
            if (childPid is not null && IsProcessRunning(childPid.Value))
            {
                Process.GetProcessById(childPid.Value).Kill(entireProcessTree: true);
            }
        }
    }

    private static DerivedMetricService CreateService() =>
        new(NullLogger<DerivedMetricService>.Instance, null!);

    private static bool IsProcessRunning(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            return !process.HasExited;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static Result CreateResult(string set, string reference, decimal score) => new()
    {
        Set = set,
        Ref = reference,
        Metrics = new Dictionary<string, Metric>
        {
            ["score"] = new() { Value = score },
        },
    };

    private sealed class TemporaryFunctionFolder : IDisposable
    {
        public TemporaryFunctionFolder()
        {
            Path = Directory.CreateTempSubdirectory("catalog-aggregates-").FullName;
        }

        public string Path { get; }

        public void Write(string name, string contents)
        {
            File.WriteAllText(System.IO.Path.Combine(Path, name), contents);
        }

        public void Dispose()
        {
            Directory.Delete(Path, recursive: true);
        }
    }
}
