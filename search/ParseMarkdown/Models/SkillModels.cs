/// <summary>
/// Request body for Azure AI Search custom skill
/// </summary>
public class SkillRequest
{
    public List<SkillInputRecord> Values { get; set; } = [];
}

/// <summary>
/// Individual input record from Azure AI Search
/// </summary>
public class SkillInputRecord
{
    public string RecordId { get; set; } = string.Empty;
    public SkillInputData Data { get; set; } = new();
}

/// <summary>
/// Input data containing the markdown content
/// </summary>
public class SkillInputData
{
    public string? Content { get; set; }
}

/// <summary>
/// Response body for Azure AI Search custom skill
/// </summary>
public class SkillResponse
{
    public List<SkillOutputRecord> Values { get; set; } = [];
}

/// <summary>
/// Individual output record for Azure AI Search
/// </summary>
public class SkillOutputRecord
{
    public string RecordId { get; set; } = string.Empty;
    public SkillOutputData Data { get; set; } = new();
    public List<SkillMessage> Errors { get; set; } = [];
    public List<SkillMessage> Warnings { get; set; } = [];
}

/// <summary>
/// Parsed frontmatter data
/// </summary>
public class SkillOutputData
{
    public List<string> Authors { get; set; } = [];
    public string? PostSlug { get; set; }
    public string? PostTitle { get; set; }
    public DateTimeOffset? PostDate { get; set; }
    public List<string> Tags { get; set; } = [];
    public string? Summary { get; set; }
}

/// <summary>
/// Error or warning message
/// </summary>
public class SkillMessage
{
    public string Message { get; set; } = string.Empty;
}
