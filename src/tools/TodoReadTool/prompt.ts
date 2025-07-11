export const DESCRIPTION =
  'Reads and displays todo items from the current session. Supports filtering by status, priority, or specific todo ID.'

export const PROMPT = `Use this tool to read and view todo items in the current session. This tool provides:

1. **All todos**: Get complete list of all todos with their current status
2. **Filter by status**: Get todos with specific status (pending, in_progress, completed)  
3. **Filter by priority**: Get todos with specific priority (high, medium, low)
4. **Get specific todo**: Read a single todo by its ID
5. **Summary view**: Get a quick overview of todo distribution by status

The tool returns todos in a structured format showing:
- Content and description
- Current status and priority
- Created and updated timestamps
- Todo ID for reference

This is particularly useful for:
- Tracking progress on complex multi-step tasks
- Understanding current work status
- Planning next actions based on pending todos
- Reviewing completed work

The tool is read-only and does not modify any todo items.`
