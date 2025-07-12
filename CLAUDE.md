# CLAUDE.md

This file provides guidance to Any Kode when working with code in this repository.

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

This is "any-kode", a terminal-based AI coding assistant that provides Claude-like functionality through any OpenAI-compatible API.

### Installation
```bash
npm install -g any-kode
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

## Checkpoint Records

### Checkpoint 2025-01-13T06:06:00.000Z
**Project**: any-kode | **Branch**: feature-kimi-model-support  
**Milestone**: Multi-Provider LLM Support & Enhanced Error Handling

#### Technical Status
- **Code Quality**: Excellent (9/10)
- **Architecture Health**: Robust with 233 TypeScript files
- **Development Phase**: Active feature development (High intensity)
- **Feature Completeness**: Comprehensive LLM ecosystem support

#### Major Features Added
- 🌟 **Multi-Provider LLM Support**: Added 15+ new LLM providers (Kimi, Gemini, DeepSeek, Qwen, GLM, SiliconFlow, Baidu Qianfan, Minimax, Mistral, XAI, Groq, Azure, OpenRouter, Ollama)
- 🎛️ **Enhanced Model Configuration**: Context length options (32K-2000K tokens), provider-specific endpoints
- 🔑 **Provider-Specific API Verification**: Comprehensive API key validation across all providers
- ⚡ **Advanced Error Handling**: 10-retry mechanism with exponential backoff for robust API communication
- 🎯 **UI/UX Improvements**: Fixed ESC cancellation synchronization, immediate interrupt feedback

#### Recent Achievements
- ✅ Expanded LLM provider ecosystem from 3 to 15+ supported providers
- ✅ Enhanced ModelSelector with context length configuration (32K-2000K tokens)
- ✅ Implemented provider-specific API key verification and validation
- ✅ Enhanced API error handling with 10-retry mechanism and exponential backoff
- ✅ Fixed ESC cancellation UI synchronization bug with immediate interrupt display
- ✅ Removed Chinese error messages for full internationalization support
- ✅ Implemented comprehensive request state isolation and cleanup
- ✅ Added proper error boundaries and enhanced debugging capabilities

#### Documentation Maintenance
- ✅ **README.md**: Updated to match current project identity (any-kode)
- ✅ **Project Alignment**: Synchronized package name, installation commands, and repository URLs
- ✅ **Architecture Documentation**: Comprehensive technical documentation maintained in CLAUDE.md
- ✅ **Provider Documentation**: Added documentation for multi-provider support

#### LLM Provider Ecosystem
**Supported Providers**: Anthropic, Gemini, OpenAI, Ollama, OpenRouter, DeepSeek, Kimi, Qwen, GLM, SiliconFlow, Baidu Qianfan, Minimax, Mistral, XAI, Groq, Azure, Custom OpenAI-compatible

**Configuration Features**:
- Context length options: 32K, 64K, 128K, 200K, 256K, 300K, 512K, 1000K, 2000K tokens
- Provider-specific API endpoints and authentication
- Custom model configuration support
- Advanced reasoning effort settings (low/medium/high)
- Comprehensive model validation and verification

#### Current Development Trajectory
📈 **Ascending** - Major feature expansion with comprehensive LLM ecosystem integration

#### Recommendations
1. Test new provider integrations thoroughly across different use cases
2. Document provider-specific configuration requirements and limitations
3. Consider provider-specific optimization strategies for performance
4. Validate API key verification across all 15+ providers
5. Continue expanding model ecosystem support for emerging providers
6. Commit current feature branch changes after comprehensive testing
7. Consider creating provider-specific documentation guides

**Files Modified**: 27 core files enhanced with multi-provider support  
**Git Status**: Major feature expansion ready for testing