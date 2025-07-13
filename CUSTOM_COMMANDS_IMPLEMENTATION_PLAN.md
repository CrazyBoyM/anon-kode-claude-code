# Markdown 自定义命令功能集成施工计划

## 🎯 项目目标

将 Claude Code 的 Markdown 自定义命令功能完整集成到 last-kode 项目中，保持现有架构风格和代码质量标准。

## 📋 技术分析

### 现有架构兼容性分析

#### 命令系统架构
```typescript
// 现有命令接口 (src/commands.ts)
type Command = {
  description: string
  isEnabled: boolean
  isHidden: boolean
  name: string
  aliases?: string[]
  userFacingName(): string
} & (PromptCommand | LocalCommand | LocalJSXCommand)
```

#### 工具系统架构
```typescript
// 现有工具接口 (src/Tool.ts)
interface Tool {
  name: string
  inputSchema: ZodSchema
  call(): AsyncGenerator<ToolResult>
  needsPermissions(): boolean
}
```

## 🗂️ 文件修改清单

### 新增文件
1. `src/services/customCommands.ts` - 核心服务
2. `src/utils/frontmatter.ts` - YAML 解析器
3. `src/constants/customCommands.ts` - 相关常量

### 修改文件  
1. `src/commands.ts` - 集成自定义命令
2. `src/utils/config.ts` - 配置扩展
3. `src/components/Help.tsx` - 帮助信息更新

### 可选文件
1. `docs/custom-commands.md` - 用户文档

## 📝 详细实施计划

### 第一阶段：核心基础设施

#### 1.1 创建常量定义文件

```typescript
// src/constants/customCommands.ts
import { join } from 'path'
import { homedir } from 'os'

export const CUSTOM_COMMANDS = {
  GLOBAL_DIR: join(homedir(), '.claude', 'commands'),
  PROJECT_DIR: join(process.cwd(), '.claude', 'commands'),
  FILE_PATTERN: '*.md',
  SCAN_TIMEOUT: 3000,
  CACHE_TTL: 300000, // 5 minutes
} as const

export const FRONTMATTER_SCHEMA = {
  DELIMITER: /^---\s*\n([\s\S]*?)---\s*\n?/,
  ARRAY_INLINE: /^\[(.+)\]$/,
  ARRAY_MULTILINE: /^-\s+(.+)$/gm,
  BOOLEAN_TRUE: /^(true|yes|on)$/i,
  BOOLEAN_FALSE: /^(false|no|off)$/i,
} as const
```

#### 1.2 创建 Frontmatter 解析器

```typescript
// src/utils/frontmatter.ts
import { FRONTMATTER_SCHEMA } from '../constants/customCommands'

export interface CommandFrontmatter {
  name?: string
  description?: string
  aliases?: string[]
  enabled?: boolean
  hidden?: boolean
  argNames?: string[]
  progressMessage?: string
}

interface ParseResult {
  frontmatter: CommandFrontmatter
  content: string
}

export function parseFrontmatter(text: string): ParseResult {
  const match = text.match(FRONTMATTER_SCHEMA.DELIMITER)
  
  if (!match) {
    return {
      frontmatter: {},
      content: text
    }
  }

  const yamlContent = match[1] || ''
  const remainingContent = text.slice(match[0].length)
  
  return {
    frontmatter: parseYaml(yamlContent),
    content: remainingContent.trim()
  }
}

function parseYaml(yaml: string): CommandFrontmatter {
  const result: CommandFrontmatter = {}
  const lines = yaml.split('\n').filter(line => line.trim())

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()

    if (!value) continue

    switch (key) {
      case 'name':
      case 'description':
      case 'progressMessage':
        result[key] = value
        break
      
      case 'aliases':
      case 'argNames':
        result[key] = parseArrayValue(value)
        break
      
      case 'enabled':
      case 'hidden':
        result[key] = parseBooleanValue(value)
        break
    }
  }

  return result
}

function parseArrayValue(value: string): string[] {
  const inlineMatch = value.match(FRONTMATTER_SCHEMA.ARRAY_INLINE)
  if (inlineMatch) {
    return inlineMatch[1]
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  }

  const multilineMatches = Array.from(value.matchAll(FRONTMATTER_SCHEMA.ARRAY_MULTILINE))
  if (multilineMatches.length > 0) {
    return multilineMatches.map(match => match[1].trim()).filter(Boolean)
  }

  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function parseBooleanValue(value: string): boolean {
  if (FRONTMATTER_SCHEMA.BOOLEAN_TRUE.test(value)) return true
  if (FRONTMATTER_SCHEMA.BOOLEAN_FALSE.test(value)) return false
  return true
}
```

### 第二阶段：核心服务实现

#### 2.1 创建自定义命令服务

```typescript
// src/services/customCommands.ts
import { existsSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { glob } from 'glob'
import { memoize } from 'lodash-es'
import type { Command } from '../commands'
import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { parseFrontmatter, type CommandFrontmatter } from '../utils/frontmatter'
import { CUSTOM_COMMANDS } from '../constants/customCommands'
import { logEvent } from './statsig'

interface CustomCommandSource {
  filePath: string
  content: string
  frontmatter: CommandFrontmatter
  scope: 'global' | 'project'
}

export const loadCustomCommands = memoize(
  async (): Promise<Command[]> => {
    const startTime = Date.now()
    
    try {
      const [globalCommands, projectCommands] = await Promise.all([
        scanCommandDirectory(CUSTOM_COMMANDS.GLOBAL_DIR, 'global'),
        scanCommandDirectory(CUSTOM_COMMANDS.PROJECT_DIR, 'project')
      ])

      const allSources = [...globalCommands, ...projectCommands]
      const commands = allSources.map(createCommandFromSource)
      
      const duration = Date.now() - startTime
      logEvent('custom_commands_loaded', {
        globalCount: globalCommands.length,
        projectCount: projectCommands.length,
        totalCount: commands.length,
        durationMs: duration
      })

      return commands
    } catch (error) {
      logEvent('custom_commands_error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return []
    }
  },
  () => 'custom-commands'
)

async function scanCommandDirectory(
  directory: string,
  scope: 'global' | 'project'
): Promise<CustomCommandSource[]> {
  if (!existsSync(directory)) {
    return []
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CUSTOM_COMMANDS.SCAN_TIMEOUT)

  try {
    const pattern = join(directory, CUSTOM_COMMANDS.FILE_PATTERN)
    const files = await glob(pattern, { 
      signal: controller.signal,
      absolute: true 
    })

    return files.map(filePath => {
      try {
        const content = readFileSync(filePath, 'utf-8')
        const { frontmatter, content: bodyContent } = parseFrontmatter(content)
        
        return {
          filePath,
          content: bodyContent,
          frontmatter,
          scope
        }
      } catch (error) {
        throw new Error(`Failed to parse ${filePath}: ${error}`)
      }
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

function createCommandFromSource(source: CustomCommandSource): Command {
  const filename = basename(source.filePath, '.md')
  const commandName = source.frontmatter.name || filename
  const description = source.frontmatter.description || extractFirstLine(source.content)
  
  return {
    type: 'prompt',
    name: commandName,
    description,
    isEnabled: source.frontmatter.enabled !== false,
    isHidden: source.frontmatter.hidden === true,
    aliases: source.frontmatter.aliases,
    progressMessage: source.frontmatter.progressMessage || `Executing ${commandName}`,
    argNames: source.frontmatter.argNames,
    
    userFacingName() {
      return commandName
    },
    
    async getPromptForCommand(args: string): Promise<MessageParam[]> {
      const processedContent = substituteArguments(
        source.content,
        args,
        source.frontmatter.argNames
      )
      
      return [{
        type: 'text',
        text: processedContent
      }]
    }
  } satisfies Command
}

function extractFirstLine(content: string): string {
  const firstLine = content.split('\n')[0]?.trim()
  if (!firstLine) return 'Custom command'
  
  const headerMatch = firstLine.match(/^#+\s+(.+)$/)
  if (headerMatch) {
    const title = headerMatch[1]
    return title.length > 100 ? title.substring(0, 97) + '...' : title
  }
  
  return firstLine.length > 100 ? firstLine.substring(0, 97) + '...' : firstLine
}

function substituteArguments(
  content: string,
  args: string,
  argNames?: string[]
): string {
  if (!argNames || argNames.length === 0) {
    return content
  }

  const argValues = args.trim().split(/\s+/)
  let result = content

  argNames.forEach((argName, index) => {
    const value = argValues[index] || `{${argName}}`
    const pattern = new RegExp(`\\{${argName}\\}`, 'g')
    result = result.replace(pattern, value)
  })

  return result
}
```

### 第三阶段：系统集成

#### 3.1 更新命令系统

```typescript
// src/commands.ts 修改
import { loadCustomCommands } from './services/customCommands'

// 在现有的 getCommands 函数中添加自定义命令
export const getCommands = memoize(async (): Promise<Command[]> => {
  return [
    ...(await getMCPCommands()),
    ...(await loadCustomCommands()), // 新增
    ...COMMANDS()
  ].filter(_ => _.isEnabled)
})
```

#### 3.2 更新配置类型

```typescript
// src/utils/config.ts 添加配置支持
export type GlobalConfig = {
  // 现有配置...
  customCommands?: {
    enableGlobal?: boolean
    enableProject?: boolean
    scanTimeout?: number
  }
}

export type ProjectConfig = {
  // 现有配置...
  customCommands?: {
    enabled?: boolean
  }
}
```

#### 3.3 更新帮助组件

```typescript
// src/components/Help.tsx 修改
export function Help({
  commands,
  onClose,
}: {
  commands: Command[]
  onClose: () => void
}): React.ReactNode {
  const theme = getTheme()
  const filteredCommands = commands.filter(cmd => !cmd.isHidden)
  
  // 分离内置命令和自定义命令
  const builtinCommands = filteredCommands.filter(cmd => 
    !cmd.name.includes('/') && cmd.type !== 'custom'
  )
  const customCommands = filteredCommands.filter(cmd => 
    cmd.type === 'prompt' && cmd.name !== 'init' // 排除内置的 prompt 命令
  )

  return (
    <Box flexDirection="column" padding={1}>
      {/* 现有帮助内容... */}
      
      {customCommands.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Custom Commands:</Text>
          {customCommands.slice(0, 8).map(cmd => (
            <Text key={cmd.name}>
              • <Text bold>/{cmd.userFacingName()}</Text>
              {cmd.aliases && ` (${cmd.aliases.join(', ')})`}
              <Text color={theme.secondaryText}> - {cmd.description}</Text>
            </Text>
          ))}
          {customCommands.length > 8 && (
            <Text color={theme.secondaryText}>
              ... and {customCommands.length - 8} more
            </Text>
          )}
        </Box>
      )}
      
      {/* 现有帮助内容继续... */}
    </Box>
  )
}
```

### 第四阶段：用户体验优化

#### 4.1 创建初始化命令

```typescript
// src/commands/customCommandsInit.ts
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { CUSTOM_COMMANDS } from '../constants/customCommands'
import type { Command } from '../commands'

const EXAMPLE_COMMAND = `---
name: example
description: An example custom command
aliases: [ex, demo]
argNames: [target]
progressMessage: Running example on {target}
---

This is an example custom command.

Target: {target}

You can create more commands by adding .md files to:
- ~/.claude/commands/ (global commands)
- ./.claude/commands/ (project commands)

Learn more at: https://docs.anthropic.com/claude-code/custom-commands
`

const customCommandsInit = {
  type: 'local',
  name: 'custom-commands-init',
  description: 'Initialize custom commands directories with examples',
  isEnabled: true,
  isHidden: false,
  
  async call(): Promise<string> {
    const results: string[] = []
    
    // Create global directory
    if (!existsSync(CUSTOM_COMMANDS.GLOBAL_DIR)) {
      mkdirSync(CUSTOM_COMMANDS.GLOBAL_DIR, { recursive: true })
      const examplePath = join(CUSTOM_COMMANDS.GLOBAL_DIR, 'example.md')
      writeFileSync(examplePath, EXAMPLE_COMMAND)
      results.push(`Created ${CUSTOM_COMMANDS.GLOBAL_DIR} with example command`)
    } else {
      results.push(`Global commands directory already exists: ${CUSTOM_COMMANDS.GLOBAL_DIR}`)
    }
    
    // Create project directory
    if (!existsSync(CUSTOM_COMMANDS.PROJECT_DIR)) {
      mkdirSync(CUSTOM_COMMANDS.PROJECT_DIR, { recursive: true })
      results.push(`Created ${CUSTOM_COMMANDS.PROJECT_DIR}`)
    } else {
      results.push(`Project commands directory already exists: ${CUSTOM_COMMANDS.PROJECT_DIR}`)
    }
    
    results.push('\nCustom commands are now ready! Use /help to see available commands.')
    return results.join('\n')
  },
  
  userFacingName() {
    return 'custom-commands-init'
  },
} satisfies Command

export default customCommandsInit
```

## 🧪 测试策略

### 单元测试

```typescript
// src/__tests__/frontmatter.test.ts
import { parseFrontmatter } from '../utils/frontmatter'

describe('Frontmatter Parser', () => {
  test('parses basic frontmatter', () => {
    const content = `---
name: test
description: A test command
---
Command content here`

    const result = parseFrontmatter(content)
    
    expect(result.frontmatter.name).toBe('test')
    expect(result.frontmatter.description).toBe('A test command')
    expect(result.content).toBe('Command content here')
  })

  test('handles inline arrays', () => {
    const content = `---
aliases: [alias1, alias2, alias3]
---
Content`

    const result = parseFrontmatter(content)
    expect(result.frontmatter.aliases).toEqual(['alias1', 'alias2', 'alias3'])
  })
})
```

### 集成测试

```typescript
// src/__tests__/customCommands.test.ts
import { loadCustomCommands } from '../services/customCommands'

describe('Custom Commands Service', () => {
  test('loads commands from directories', async () => {
    const commands = await loadCustomCommands()
    expect(Array.isArray(commands)).toBe(true)
  })
})
```

## 📋 部署检查清单

### 代码质量检查
- [ ] 所有新文件遵循项目 TypeScript 配置
- [ ] 使用现有的依赖库（lodash-es, glob 等）
- [ ] 错误处理与现有模式一致
- [ ] 日志记录使用现有的 statsig 服务

### 功能验证
- [ ] 命令加载正常工作
- [ ] Frontmatter 解析正确
- [ ] 参数替换功能正常
- [ ] 与现有命令系统集成无冲突

### 性能验证
- [ ] 命令加载不超过 3 秒
- [ ] 内存使用在合理范围
- [ ] 缓存机制正常工作

### 用户体验
- [ ] 帮助信息正确显示
- [ ] 错误消息清晰易懂
- [ ] 自动完成功能正常

## 🚀 发布流程

1. **开发分支**: 在 `feature/custom-commands` 分支开发
2. **代码审查**: 提交 PR 进行代码审查
3. **测试验证**: 运行完整测试套件
4. **文档更新**: 更新用户文档和 README
5. **合并发布**: 合并到主分支并发布

## 📚 用户文档大纲

```markdown
# Custom Commands

## Quick Start
- Creating your first command
- Directory structure
- Basic markdown format

## Advanced Features  
- Parameter substitution
- Command aliases
- Progress messages

## Examples
- Common use cases
- Template commands
- Best practices

## Troubleshooting
- Common errors
- Performance tips
```

## 🎯 成功标准

这个施工计划确保了：
1. **最小化修改** - 只添加必要的文件，最少修改现有代码
2. **架构一致性** - 完全符合现有项目结构和编码风格
3. **高质量代码** - 没有临时注释，完整的类型定义和错误处理
4. **渐进式集成** - 分阶段实施，每个阶段都可以独立验证

## 📝 实施时间表

- **第一阶段**: 1-2 天 (基础设施)
- **第二阶段**: 2-3 天 (核心服务)
- **第三阶段**: 1-2 天 (系统集成)
- **第四阶段**: 1 天 (用户体验)
- **测试和文档**: 1-2 天

**总预计时间**: 6-10 天