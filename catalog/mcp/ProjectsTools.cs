using System.Collections.Generic;
using System.ComponentModel;
using System.Threading;
using System.Threading.Tasks;
using ModelContextProtocol.Server;

namespace Catalog;

/// <summary>
/// MCP tools for project management operations.
/// </summary>
[McpServerToolType]
public class ProjectsTools(IStorageService storageService)
{
    private void ValidateProjectName(string? project) => McpValidationHelper.ValidateProjectName(project, storageService);

    /// <summary>
    /// Lists all projects.
    /// </summary>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A list of all projects.</returns>
    [McpServerTool(Name = "ListProjects"), Description("List all projects.")]
    public async Task<IList<Project>> ListProjects(
        CancellationToken cancellationToken = default)
    {
        return await storageService.GetProjectsAsync(cancellationToken);
    }

    /// <summary>
    /// Adds a new project.
    /// </summary>
    /// <param name="name">The project name.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A message indicating the project was added.</returns>
    [McpServerTool(Name = "AddProject"), Description("Add a new project.")]
    public async Task<string> AddProject(
        [Description("The project name")] string name,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(name);

        var project = new Project { Name = name };
        await storageService.AddProjectAsync(project, cancellationToken);
        return $"Project '{name}' added.";
    }

    /// <summary>
    /// Lists all tag names in a project.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A list of tag names.</returns>
    [McpServerTool(Name = "ListTags"), Description("List all tag names in a project.")]
    public async Task<IList<string>> ListTags(
        [Description("The project name")] string project,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);

        return await storageService.ListTagsAsync(project, cancellationToken);
    }

    /// <summary>
    /// Adds a tag to a project.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="tagName">The tag name.</param>
    /// <param name="refs">Optional list of ref identifiers associated with the tag.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A message indicating the tag was added.</returns>
    [McpServerTool(Name = "AddTagToProject"), Description("Add a tag to a project.")]
    public async Task<string> AddTagToProject(
        [Description("The project name")] string project,
        [Description("The tag name")] string tagName,
        [Description("Optional list of ref identifiers associated with the tag")] List<string>? refs = null,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);

        var tag = new Tag { Name = tagName, Refs = refs };
        await storageService.AddTagAsync(project, tag, cancellationToken);
        return $"Tag '{tagName}' added to project '{project}'.";
    }

    /// <summary>
    /// Gets the metric definitions for a project.
    /// </summary>
    /// <param name="project">The project name.</param>
    /// <param name="cancellationToken">Token to cancel the operation.</param>
    /// <returns>A list of metric definitions.</returns>
    [McpServerTool(Name = "GetMetricDefinitions"), Description("Get the metric definitions for a project.")]
    public async Task<IList<MetricDefinition>> GetMetricDefinitions(
        [Description("The project name")] string project,
        CancellationToken cancellationToken = default)
    {
        ValidateProjectName(project);

        return await storageService.GetMetricsAsync(project, cancellationToken);
    }
}
