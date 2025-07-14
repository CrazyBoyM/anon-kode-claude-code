# Any Kode

Terminal-based AI coding assistant that provides Claude-like functionality through any OpenAI-compatible API.

![Any Kode Demo](https://github.com/user-attachments/assets/7a9253a7-8bb0-40d5-a3f3-5e6096d7c789)

## Features

- 🛠️ **Code Analysis & Fixes** - Analyzes and improves your codebase
- 📖 **Code Explanation** - Explains complex functions and logic
- 🧪 **Test Execution** - Runs tests and shell commands
- 🔧 **Workflow Automation** - Handles entire development workflows
- 🤖 **Multi-Model Support** - Works with any OpenAI-compatible API
- 🎯 **15 Built-in Tools** - File operations, shell execution, notebooks, and more

## Installation

```bash
npm install -g any-kode
cd your-project
kode
```

## Quick Start

1. **Model Setup**: Use the onboarding flow or `/model` command to configure your AI provider
2. **Custom Models**: If your model isn't listed, manually configure it via `/config`
3. **OpenAI-Compatible**: Works with any OpenAI-style endpoint (Ollama, OpenRouter, etc.)

## MCP Server Integration

Use Any Kode as a Model Context Protocol server with Claude Desktop:

1. Find the full path: `which kode`
2. Add to Claude Desktop config:
```json
{
  "mcpServers": {
    "any-kode": {
      "command": "/path/to/kode",
      "args": ["mcp", "serve"]
    }
  }
}
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm run dev

# Build for production
pnpm run build

# Debug with verbose logging
NODE_ENV=development pnpm run dev --verbose --debug
```

## Architecture

- **React/Ink** - Terminal UI framework
- **15 Core Tools** - File operations, shell execution, AI workflows
- **Multi-Provider** - Anthropic Claude, OpenAI, custom endpoints
- **TypeScript** - Full type safety throughout
- **MCP Compatible** - Model Context Protocol integration

## Bug Reports

Submit bugs directly from the app using `/bug` - it will open GitHub with pre-filled information.

## Privacy & Data

- **No telemetry** - No backend servers except your chosen AI providers
- **Local processing** - All data stays on your machine
- **Open source** - Full transparency in code and data handling

## Repository

- **Homepage**: [https://github.com/shareAI-lab/any-kode](https://github.com/shareAI-lab/any-kode)
- **Issues**: [https://github.com/shareAI-lab/any-kode/issues](https://github.com/shareAI-lab/any-kode/issues)

## License

See [LICENSE.md](LICENSE.md) for details.

---

**⚠️ Use at your own risk** - This tool executes code and commands on your system.