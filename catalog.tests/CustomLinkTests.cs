using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Catalog;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Xunit;

namespace Catalog.Tests;

public class CustomLinkTests
{
    [Fact]
    public void EnvironmentUsesScopeAndSuffixAndIgnoresUnrelatedVariables()
    {
        var links = CustomLinkConfiguration.FromEnvironment(new Hashtable
        {
            ["REF_LINK_cow"] = "https://tools.example/?ref={ref}&baseline={baseline-project}",
            ["ITERATION_LINK_trace"] = "https://tools.example/?inf={inf}&eval={eval}&gt={gt}",
            ["SET_LINK_dashboard"] = "https://tools.example/?set={set}",
            ["EXPERIMENT_LINK_report"] = "https://tools.example/?experiment={experiment}",
            ["PATH_TEMPLATE"] = "not-a-custom-link",
        });

        Assert.Equal(4, links.Count);
        Assert.Equal("report", links[0].Name);
        Assert.Equal("trace", links[1].Name);
        Assert.Equal("cow", links[2].Name);
        Assert.Equal("ref", links[2].Scope);
        Assert.Contains("{baseline-project}", links[2].Url);
    }

    [Theory]
    [InlineData("ref", "", "https://tools.example")]
    [InlineData("other", "cow", "https://tools.example")]
    [InlineData("ref", "cow", "javascript:alert(1)")]
    [InlineData("ref", "cow", "/relative/path")]
    [InlineData("ref", "cow", "https://tools.example/?inf={inf}")]
    [InlineData("set", "cow", "https://tools.example/?ref={ref}")]
    [InlineData("experiment", "cow", "https://tools.example/{set}")]
    [InlineData("iteration", "cow", "https://tools.example/{iteration}")]
    [InlineData("ref", "cow", "https://tools.example/{comparison-target-project}")]
    [InlineData("ref", "cow", "https://tools.example/{project-baseline-set}")]
    [InlineData("ref", "cow", "https://tools.example/{ref")]
    [InlineData("ref", "cow", "")]
    public void RejectsInvalidDefinitions(string scope, string name, string url)
    {
        Assert.Throws<ValidationException>(() => CustomLinkConfiguration.Validate(
            [new CustomLink { Scope = scope, Name = name, Url = url }]));
    }

    [Fact]
    public void RejectsInvalidEnvironmentAndDuplicateScopeNames()
    {
        Assert.Throws<ValidationException>(() => CustomLinkConfiguration.FromEnvironment(
            new Hashtable { ["REF_LINK_"] = "https://tools.example" }));
        var link = new CustomLink { Scope = "ref", Name = "cow", Url = "https://tools.example/{ref}" };
        Assert.Throws<ValidationException>(() => CustomLinkConfiguration.Validate([link, link]));
        Assert.Throws<ValidationException>(() => CustomLinkConfiguration.Validate([null!]));
        CustomLinkConfiguration.Validate(
            [link, new CustomLink { Scope = "set", Name = "cow", Url = "https://tools.example/{set}" }]);
    }

    [Fact]
    public async Task ProjectEndpointsReplaceAndClearStoredDefinitionsWithoutDeploymentDefaults()
    {
        var storage = DispatchProxy.Create<IStorageService, LinkStorage>();
        var controller = new ProjectsController();
        var links = JsonConvert.DeserializeObject<List<CustomLink>>(
            """[{"scope":"ref","name":"cow","url":"https://tools.example/{project}/{ref}"}]""")!;

        Assert.IsType<OkResult>(await controller.SetLinks(storage, "example", links, CancellationToken.None));
        var response = await controller.GetLinks(storage, "example", CancellationToken.None);
        var stored = Assert.IsAssignableFrom<IList<CustomLink>>(Assert.IsType<OkObjectResult>(response.Result).Value);
        Assert.Equal("cow", Assert.Single(stored).Name);
        Assert.Equal(JsonConvert.SerializeObject(links), JsonConvert.SerializeObject(stored));

        Assert.IsType<BadRequestObjectResult>(await controller.SetLinks(
            storage, "example", [links[0], links[0]], CancellationToken.None));
        Assert.IsType<BadRequestObjectResult>(await controller.SetLinks(
            storage, "example", [new CustomLink { Scope = "ref", Name = "bad", Url = "file:///tmp/test" }],
            CancellationToken.None));
        Assert.Single(((LinkStorage)(object)storage).Links);

        await controller.SetLinks(storage, "example", [], CancellationToken.None);
        Assert.Empty(((LinkStorage)(object)storage).Links);
    }

    public class LinkStorage : DispatchProxy
    {
        public IList<CustomLink> Links { get; private set; } = new List<CustomLink>();

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            switch (targetMethod?.Name)
            {
                case nameof(IStorageService.GetLinksAsync):
                    return Task.FromResult(Links);
                case nameof(IStorageService.SetLinksAsync):
                    Links = (IList<CustomLink>)args![1]!;
                    return Task.CompletedTask;
                default:
                    throw new NotSupportedException();
            }
        }
    }
}
