# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `pnpm run dev` - Run the CLI in development mode with tsx
- `pnpm run build` - Build the CLI using Bun to create `cli.mjs`
- `pnpm run format` - Format code using Prettier
- `pnpm run format:check` - Check code formatting

For debugging with verbose output:
```bash
NODE_ENV=development pnpm run dev --verbose --debug
```

## Installation and Usage

This is "last-kode", a terminal-based AI coding assistant that provides Claude-like functionality through any OpenAI-compatible API.

### Installation
```bash
npm install -g last-kode
cd your-project
kode
```

### MCP Server Usage
Find the full path to `kode` with `which kode` then add to Claude Desktop config:
```json
{
  "mcpServers": {
    "claude-code": {
      "command": "/path/to/kode",
      "args": ["mcp", "serve"]
    }
  }
}
```

## Architecture Overview

### Core Structure

- **Entry Point**: `src/entrypoints/cli.tsx` - Main CLI application using React/Ink for terminal UI
- **MCP Server**: `src/entrypoints/mcp.ts` - Model Context Protocol server implementation  
- **REPL Interface**: `src/screens/REPL.tsx` - Main interactive terminal interface with conversation flow

### Key Services

- **Model Providers**: 
  - `src/services/claude.ts` - Anthropic Claude API integration (supports Bedrock, Vertex)
  - `src/services/openai.ts` - OpenAI-compatible API integration with error handling
- **Configuration**: `src/utils/config.ts` - Handles global and project-specific settings with JSON storage
- **Authentication**: `src/services/oauth.ts` - OAuth flow for API key management
- **Query Engine**: `src/query.ts` - Core conversation logic and message processing

### Tool System Architecture

The application uses a comprehensive tool system in `src/tools/` with 18 core tools:

**File Operations**: FileReadTool, FileWriteTool, FileEditTool, MultiEditTool, lsTool, GlobTool, GrepTool
**Shell Execution**: BashTool (with persistent session and security restrictions)
**Advanced AI**: AgentTool (launches sub-tasks), ArchitectTool (project planning)
**Task Management**: TodoReadTool, TodoWriteTool (with system reminder integration)
**Notebook Support**: NotebookReadTool, NotebookEditTool (Jupyter integration)
**Memory System**: MemoryReadTool, MemoryWriteTool (agent-specific memory storage)
**Integration**: MCPTool (Model Context Protocol), ThinkTool, StickerRequestTool

#### Tool Implementation Pattern
Each tool follows a strict directory structure:
```
ToolName/
├── ToolName.tsx     # Main React component implementation
├── prompt.ts        # Tool-specific prompts and descriptions  
├── constants.ts     # Tool constants (optional)
└── utils.ts         # Helper utilities (optional)
```

#### Tool Interface Requirements
Tools implement a comprehensive interface with these key methods:
- `name`, `description()`, `prompt()` - Tool identification and context
- `inputSchema` (Zod), `validateInput()` - Input validation
- `call()` - Main execution (async generator for progressive results)
- `renderToolUseMessage()`, `renderToolResultMessage()` - Terminal UI rendering
- `needsPermissions()`, `isReadOnly()`, `isConcurrencySafe()` - Security and execution controls

#### Task Management System
The TodoReadTool and TodoWriteTool provide sophisticated task tracking:
- **State Management**: Pending, in_progress, completed status with single in-progress constraint
- **Priority Levels**: High, medium, low priority classification
- **Validation**: Duplicate ID detection and business rule enforcement
- **System Integration**: Automatic system reminder generation for task workflows
- **Persistence**: JSON-based storage in `src/utils/todoStorage.ts`

#### Context Engineering and System Reminders
Advanced context awareness through `src/services/systemReminder.ts`:
- **File Freshness Tracking**: Monitors file read/write operations to detect stale context
- **System Reminder Injection**: Automatically adds relevant context reminders to conversations
- **Agent Coordination**: Tracks multi-agent workflows and provides context sharing
- **Event-Driven Architecture**: Tool usage triggers contextual reminders for improved AI awareness

### Model Configuration

Models are defined in `src/constants/models.ts` with support for:
- OpenAI models (GPT-4, GPT-4o, etc.) with cost tracking
- Anthropic Claude models (via direct API, Bedrock, Vertex)
- Custom OpenAI-compatible endpoints (Ollama, OpenRouter, etc.)
- Comprehensive cost tracking and token limits per model

### Permission and Security System

Robust permission system in `src/permissions.ts` and `src/components/permissions/`:
- Tool-specific permission requests with approval dialogs
- File system access controls with directory containment
- Bash command approval and restricted command list
- Project-level trust settings

### State Management

- `src/context.ts` - React context for global application state
- `src/utils/sessionState.ts` - Session-specific conversation state
- `src/history.ts` - Command history management and persistence
- `src/messages.ts` - Message state management for conversation flow
- `src/utils/todoStorage.ts` - Persistent task management with JSON storage
- `src/utils/agentStorage.ts` - Agent coordination and memory management
- `src/services/fileFreshness.ts` - File modification tracking for context freshness

### UI Architecture

Built with React/Ink for terminal rendering:
- **Screens**: `/src/screens/` - Main application screens (REPL, Doctor, LogList, etc.)
- **Components**: `/src/components/` - Reusable UI components with permission dialogs
- **Message System**: Progressive message rendering with tool execution feedback

## Development Notes

- Uses React/Ink for terminal UI rendering with TypeScript throughout
- Bun for building optimized CLI bundle, tsx for development hot-reload
- Supports multiple AI providers through unified interface abstraction
- MCP (Model Context Protocol) server capability for Claude Desktop integration
- Built-in cost tracking, usage monitoring, and conversation logging
- Sentry integration for error tracking and debugging
- Advanced task management with system reminder integration for improved AI workflow awareness
- File freshness tracking and context engineering for optimal AI performance
- Multi-agent coordination system with shared memory and context passing

## Important Development Patterns

### Todo Usage
When working with complex tasks, use the TodoWriteTool to track progress:
- Always mark only ONE task as `in_progress` at a time
- Use clear, actionable task descriptions
- Update status immediately after completing work
- Leverage priority levels for task organization

### System Reminders
The system automatically injects contextual reminders based on:
- File modification patterns and stale context detection
- Tool usage patterns and workflow optimization opportunities
- Task management state changes and coordination needs
- Agent interaction patterns and memory sharing requirements

## Checkpoint Records

### Checkpoint 2025-01-13T06:06:00.000Z
**Project**: last-kode | **Branch**: feature-kimi-model-support  
**Milestone**: Enhanced Error Handling & Bug Fixes

#### Technical Status
- **Code Quality**: Excellent (8/10)
- **Architecture Health**: Robust with 233 TypeScript files
- **Development Phase**: Active feature development (High intensity)

#### Recent Achievements
- ✅ Enhanced API error handling with 10-retry mechanism and exponential backoff
- ✅ Fixed ESC cancellation UI synchronization bug with immediate interrupt display
- ✅ Removed Chinese error messages for full internationalization support
- ✅ Implemented comprehensive request state isolation and cleanup
- ✅ Added proper error boundaries and enhanced debugging capabilities

#### Documentation Maintenance
- ✅ **README.md**: Updated to match current project identity (last-kode vs anon-kode)
- ✅ **Project Alignment**: Synchronized package name, installation commands, and repository URLs
- ✅ **Architecture Documentation**: Comprehensive technical documentation maintained in CLAUDE.md

#### Current Development Trajectory
📈 **Ascending** - Active feature development with systematic code quality improvements

#### Recommendations
1. Commit current feature branch changes for API error handling improvements
2. Conduct integration testing for ESC cancellation fixes
3. Consider merging feature branch to main after validation
4. Continue systematic code quality and optimization efforts

**Files Modified**: 23 core files enhanced  
**Git Status**: Ready for commit
