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

This is "anon-kode", a terminal-based AI coding assistant that provides Claude-like functionality through any OpenAI-compatible API.

### Installation
```bash
npm install -g anon-kode
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

The application uses a comprehensive tool system in `src/tools/` with 15 core tools:

**File Operations**: FileReadTool, FileWriteTool, FileEditTool, lsTool, GlobTool, GrepTool
**Shell Execution**: BashTool (with persistent session and security restrictions)
**Advanced AI**: AgentTool (launches sub-tasks), ArchitectTool (project planning)
**Notebook Support**: NotebookReadTool, NotebookEditTool (Jupyter integration)
**Memory System**: MemoryReadTool, MemoryWriteTool
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
- `needsPermissions()`, `isReadOnly()` - Security and permission controls

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