using System.Text.RegularExpressions;

namespace ParseMarkdown.Services;

/// <summary>
/// Service to parse YAML frontmatter from markdown content
/// </summary>
public partial class MarkdownParser
{
    private readonly ILogger<MarkdownParser> _logger;

    public MarkdownParser(ILogger<MarkdownParser> logger)
    {
        _logger = logger;
    }

    [GeneratedRegex(@"^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$", RegexOptions.Compiled)]
    private static partial Regex FrontmatterRegex();

    [GeneratedRegex(@"^author\d*:\s*(.+)$", RegexOptions.Multiline | RegexOptions.Compiled)]
    private static partial Regex AuthorRegex();

    [GeneratedRegex(@"^post_slug:\s*(.+)$", RegexOptions.Multiline | RegexOptions.Compiled)]
    private static partial Regex SlugRegex();

    [GeneratedRegex(@"^post_title:\s*[""']?(.+?)[""']?\s*$", RegexOptions.Multiline | RegexOptions.Compiled)]
    private static partial Regex TitleRegex();

    [GeneratedRegex(@"^post_date:\s*(.+)$", RegexOptions.Multiline | RegexOptions.Compiled)]
    private static partial Regex DateRegex();

    [GeneratedRegex(@"^tags:\s*(.+)$", RegexOptions.Multiline | RegexOptions.Compiled)]
    private static partial Regex TagsRegex();

    [GeneratedRegex(@"^summary:\s*[""']?(.+?)[""']?\s*$", RegexOptions.Multiline | RegexOptions.Compiled)]
    private static partial Regex SummaryRegex();

    /// <summary>
    /// Process a single record from the skill request
    /// </summary>
    public SkillOutputRecord ProcessRecord(SkillInputRecord record)
    {
        var outputRecord = new SkillOutputRecord
        {
            RecordId = record.RecordId
        };

        try
        {
            outputRecord.Data = Parse(record.Data.Content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error parsing frontmatter for record {RecordId}", record.RecordId);
            outputRecord.Errors.Add(new SkillMessage { Message = $"Error parsing frontmatter: {ex.Message}" });
        }

        return outputRecord;
    }

    /// <summary>
    /// Parse markdown content and extract frontmatter fields
    /// </summary>
    /// <param name="content">Raw markdown content</param>
    /// <returns>Parsed frontmatter data</returns>
    public SkillOutputData Parse(string? content)
    {
        var result = new SkillOutputData();

        if (string.IsNullOrWhiteSpace(content))
        {
            return result;
        }

        var frontmatterMatch = FrontmatterRegex().Match(content);

        if (!frontmatterMatch.Success)
        {
            // No frontmatter found
            return result;
        }

        var frontmatter = frontmatterMatch.Groups[1].Value;
        var body = frontmatterMatch.Groups[2].Value;

        // Extract authors (author1, author2, etc.)
        var authorMatches = AuthorRegex().Matches(frontmatter);
        foreach (Match match in authorMatches)
        {
            var author = match.Groups[1].Value.Trim();
            if (!string.IsNullOrEmpty(author) && !result.Authors.Contains(author))
            {
                result.Authors.Add(author);
            }
        }

        // Extract post_slug
        var slugMatch = SlugRegex().Match(frontmatter);
        if (slugMatch.Success)
        {
            result.PostSlug = slugMatch.Groups[1].Value.Trim();
        }

        // Extract post_title
        var titleMatch = TitleRegex().Match(frontmatter);
        if (titleMatch.Success)
        {
            result.PostTitle = titleMatch.Groups[1].Value.Trim();
        }

        // Extract post_date and convert to DateTimeOffset
        var dateMatch = DateRegex().Match(frontmatter);
        if (dateMatch.Success)
        {
            result.PostDate = ParseDate(dateMatch.Groups[1].Value.Trim());
        }

        // Extract tags (comma-separated)
        var tagsMatch = TagsRegex().Match(frontmatter);
        if (tagsMatch.Success)
        {
            var tagsStr = tagsMatch.Groups[1].Value.Trim();
            result.Tags = tagsStr
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct()
                .ToList();
        }

        // Extract summary
        var summaryMatch = SummaryRegex().Match(frontmatter);
        if (summaryMatch.Success)
        {
            result.Summary = summaryMatch.Groups[1].Value.Trim();
        }

        return result;
    }

    /// <summary>
    /// Parse date string to DateTimeOffset
    /// </summary>
    private static DateTimeOffset? ParseDate(string dateStr)
    {
        // Handle format: "2025-12-11 00:00:00"
        if (DateTime.TryParse(dateStr, out var date))
        {
            return new DateTimeOffset(date, TimeSpan.Zero);
        }

        return null;
    }
}
