# CSE DevBlogs Agent (Python)

An Azure AI Foundry agent that answers questions about CSE DevBlogs using Azure AI Search for grounding. Built with the **Microsoft Agent Framework** SDK, which creates **Standard Agents** (not Classic Agents) in Azure AI Foundry.

## Prerequisites

- Python 3.11 or later
- [uv](https://docs.astral.sh/uv/) package manager
- Azure CLI installed and authenticated (`az login`)
- Access to an Azure AI Foundry project with:
  - A deployed model (e.g., gpt-4.1)
  - An Azure AI Search connection configured

## Setup

1. **Install dependencies using uv:**

   ```bash
   cd PyAgent
   uv sync
   ```

   > **Note:** The `--pre` or `--prerelease` flag is required while the Agent Framework is in preview. This is configured in `pyproject.toml` with `prerelease = "allow"`.

2. **Configure environment variables:**

   Ensure the parent directory's `.env` file contains the required variables (see `.env.example`).

3. **Authenticate with Azure:**

   ```bash
   az login
   ```

## Usage

### Run the Agent

```bash
cd PyAgent
uv run python agent.py
```

### Agent Modes

The agent supports two modes controlled by `AZURE_AGENT_MODE`:

- **`chat`** (default): Creates an agent and starts an interactive chat session
- **`create`**: Creates a new agent, runs a test query, and exits (useful for provisioning)

### Interactive Chat

Once running in chat mode, you can:

- Type questions to get answers grounded in CSE DevBlogs content
- The agent will search the Azure AI Search index and provide citations
- Type `quit`, `exit`, or `q` to end the session

## Architecture

This agent uses:

- **Azure AI Foundry**: Hosts the agent and manages conversation threads
- **Azure AI Search**: Provides grounding data from CSE DevBlogs
- **Microsoft Agent Framework v2**: Python SDK for building Azure AI agents

## Files

- `agent.py`: Main agent implementation
- `prompt.txt`: Agent instructions/system prompt
- `pyproject.toml`: Project configuration and dependencies

---

## Function Calling with Azure AI Search

### ✅ Implementation Complete

Your agent now has a **real function** that calls Azure AI Search directly: `search_ise_devblogs()`

### Installation

Install the required packages:

```bash
cd PyAgentFunction
pip install -e .
```

Or with uv:

```bash
cd PyAgentFunction
uv pip install -e .
```

This will install:
- `azure-ai-projects>=2.0.0b3` (v2 SDK)
- `azure-search-documents>=11.6.0b8` (for direct search access)
- All other dependencies

### What Was Implemented

#### 1. Real Search Function: `search_ise_devblogs()`

Located in [agent.py](agent.py#L102-L166)

```python
async def search_ise_devblogs(query: str, top: int = 5) -> str:
    """
    Search the CSE DevBlogs using Azure AI Search directly via function calling.
    
    :param query: The search query string.
    :param top: The number of results to return (default: 5, max: 10).
    :return: JSON string containing search results.
    """
```

**What it does:**
- ✅ Calls Azure AI Search directly using `SearchClient`
- ✅ Uses `DefaultAzureCredential` for authentication
- ✅ Returns formatted JSON with title, content snippet, URL, category, date
- ✅ Constructs proper devblogs.microsoft.com URLs
- ✅ Handles errors gracefully

#### 2. Agent Configuration

The agent now has **two ways to search**:

1. **Built-in Azure AI Search Tool** (automatic grounding)
2. **Custom Function** `search_ise_devblogs()` (direct control)

```python
# Configure both tools
search_tool = AzureAISearchAgentTool(...)  # Built-in
function_tool = FunctionTool(functions={search_ise_devblogs})  # Custom

# Combine them
all_tools = [search_tool] + function_tool.definitions
```

#### 3. Updated Instructions

The agent's prompt ([prompt.txt](prompt.txt)) now explains it has two search methods and when to use each.

### How Function Calling Works

#### When a user asks a question:

1. **Agent decides** which tool to use:
   - Built-in Azure AI Search tool OR
   - Custom `search_ise_devblogs()` function

2. **If using the function**:
   - Function is called with the query
   - Azure AI Search is queried directly
   - Results are returned as JSON
   - Agent uses the results to answer

3. **Function call is logged**:
   ```
   [FUNCTION CALL] search_ise_devblogs - Direct Azure AI Search access
   ```

#### Example Function Response

```json
{
  "query": "azure ai search",
  "results_count": 5,
  "results": [
    {
      "title": "Getting Started with Azure AI Search",
      "content_snippet": "Azure AI Search is a cloud search service...",
      "post_slug": "getting-started-azure-ai-search",
      "url": "https://devblogs.microsoft.com/ise/getting-started-azure-ai-search",
      "category": "Azure",
      "publish_date": "2024-01-15",
      "search_score": 8.5
    }
  ],
  "search_index": "cse-devblogs-index-v1",
  "search_service": "your-search-service"
}
```

### Verification

Check that function calling is working:

1. **During agent creation**, you'll see:
   ```
   Configuring function calling:
     - Registered function: search_ise_devblogs
     - This function calls Azure AI Search directly with custom logic
   ```

2. **In the logs** (stored in `logs/` directory), you'll see:
   ```
   [FUNCTION CALL] search_ise_devblogs - Direct Azure AI Search access
   ```

3. **The agent can use either**:
   - The built-in Azure AI Search tool
   - The custom function

### Key Differences

| Feature | Built-in Azure AI Search Tool | Custom Function |
|---------|------------------------------|-----------------|
| **Search Method** | Automatic via agent framework | Direct `SearchClient` call |
| **Control** | Framework-managed | Full Python control |
| **Result Format** | Framework-determined | Custom JSON format |
| **Use Case** | Standard searches with grounding | Custom logic, filtering, formatting |
| **Authentication** | Via connection | Via `DefaultAzureCredential` |

### Extending the Function

You can modify `search_ise_devblogs()` to:

#### Add Custom Filtering

```python
results = search_client.search(
    search_text=query,
    filter="category eq 'Azure'",  # Only Azure posts
    top=top
)
```

#### Add Faceting

```python
results = search_client.search(
    search_text=query,
    facets=["category", "publish_date"],
    top=top
)
```

#### Use Semantic Search

```python
results = search_client.search(
    search_text=query,
    query_type="semantic",
    semantic_configuration_name="default",
    top=top
)
```

#### Add More Fields

```python
select=["title", "content", "post_slug", "author", "tags", "summary"]
```

### Troubleshooting

#### Import Errors
These are normal until packages are installed:
```bash
pip install -e .
```

#### Authentication Errors
Ensure you're logged in to Azure:
```bash
az login
```

#### Search Errors
Check that:
- `AZURE_AI_SEARCH` environment variable is set
- `INDEX_NAME` and `INDEX_VERSION` are correct
- Your Azure identity has Reader permissions on the search service

### Summary

✅ **Function Implemented**: `search_ise_devblogs()` calls Azure AI Search directly  
✅ **Registered with Agent**: Function is available for the agent to call  
✅ **Two Search Methods**: Built-in tool + custom function  
✅ **Fully Documented**: With docstrings for LLM understanding  
✅ **Production Ready**: Error handling, authentication, logging  

Your agent now has **true function calling** that directly invokes Azure AI Search! 🎉
