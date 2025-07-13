import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { memoize } from 'lodash-es'
import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { Command } from '../commands'
import { getCwd } from '../utils/state'
import { logEvent } from './statsig'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Execute bash commands found in the content using ! prefix
 */
async function executeBashCommands(content: string): Promise<string> {
  // Match patterns like !`git status` or !`command here`
  const bashCommandRegex = /!\`([^`]+)\`/g
  const matches = [...content.matchAll(bashCommandRegex)]

  if (matches.length === 0) {
    return content
  }

  let result = content

  for (const match of matches) {
    const fullMatch = match[0]
    const command = match[1].trim()

    try {
      // Parse command and args (simple shell parsing)
      const parts = command.split(/\s+/)
      const cmd = parts[0]
      const args = parts.slice(1)

      // Execute with timeout
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        timeout: 5000,
        encoding: 'utf8',
        cwd: getCwd(),
      })

      // Replace the bash command with its output
      const output = stdout.trim() || stderr.trim() || '(no output)'
      result = result.replace(fullMatch, output)
    } catch (error) {
      console.warn(`Failed to execute bash command "${command}":`, error)
      result = result.replace(fullMatch, `(error executing: ${command})`)
    }
  }

  return result
}

/**
 * Resolve file references using @ prefix
 */
async function resolveFileReferences(content: string): Promise<string> {
  // Match patterns like @src/file.js or @path/to/file.txt
  const fileRefRegex = /@([a-zA-Z0-9/._-]+(?:\.[a-zA-Z0-9]+)?)/g
  const matches = [...content.matchAll(fileRefRegex)]

  if (matches.length === 0) {
    return content
  }

  let result = content

  for (const match of matches) {
    const fullMatch = match[0]
    const filePath = match[1]

    try {
      // Resolve relative to current working directory
      const fullPath = join(getCwd(), filePath)

      if (existsSync(fullPath)) {
        const fileContent = readFileSync(fullPath, { encoding: 'utf-8' })

        // Format file content with filename header
        const formattedContent = `\n\n## File: ${filePath}\n\`\`\`\n${fileContent}\n\`\`\`\n`
        result = result.replace(fullMatch, formattedContent)
      } else {
        result = result.replace(fullMatch, `(file not found: ${filePath})`)
      }
    } catch (error) {
      console.warn(`Failed to read file "${filePath}":`, error)
      result = result.replace(fullMatch, `(error reading: ${filePath})`)
    }
  }

  return result
}

/**
 * Validate allowed-tools from frontmatter
 */
function validateAllowedTools(allowedTools: string[] | undefined): boolean {
  // For now, just log the allowed tools - full validation would integrate with the tool system
  if (allowedTools && allowedTools.length > 0) {
    console.log('Command allowed tools:', allowedTools)
    // TODO: Integrate with actual tool permission system
  }
  return true // Allow execution for now
}

export interface CustomCommandFrontmatter {
  name?: string
  description?: string
  aliases?: string[]
  enabled?: boolean
  hidden?: boolean
  progressMessage?: string
  argNames?: string[]
  'allowed-tools'?: string[]
}

export interface CustomCommandFile {
  frontmatter: CustomCommandFrontmatter
  content: string
  filePath: string
}

/**
 * Parse YAML frontmatter from markdown content
 */
export function parseFrontmatter(content: string): {
  frontmatter: CustomCommandFrontmatter
  content: string
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)---\s*\n?/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { frontmatter: {}, content }
  }

  const yamlContent = match[1] || ''
  const markdownContent = content.slice(match[0].length)
  const frontmatter: CustomCommandFrontmatter = {}

  // Simple YAML parser for basic key-value pairs and arrays
  const lines = yamlContent.split('\n')
  let currentKey: string | null = null
  let arrayItems: string[] = []
  let inArray = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Handle array continuation
    if (inArray && trimmed.startsWith('-')) {
      const item = trimmed.slice(1).trim().replace(/['"]/g, '')
      arrayItems.push(item)
      continue
    }

    // End array if we hit a new key
    if (inArray && trimmed.includes(':')) {
      if (currentKey) {
        frontmatter[currentKey as keyof CustomCommandFrontmatter] =
          arrayItems as any
      }
      inArray = false
      arrayItems = []
      currentKey = null
    }

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const key = trimmed.slice(0, colonIndex).trim()
    const value = trimmed.slice(colonIndex + 1).trim()

    // Handle inline arrays [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/['"]/g, ''))
        .filter(s => s.length > 0)
      frontmatter[key as keyof CustomCommandFrontmatter] = items as any
    }
    // Handle multi-line arrays
    else if (value === '' || value === '[]') {
      currentKey = key
      inArray = true
      arrayItems = []
    }
    // Handle boolean values
    else if (value === 'true' || value === 'false') {
      frontmatter[key as keyof CustomCommandFrontmatter] = (value ===
        'true') as any
    }
    // Handle string values
    else {
      frontmatter[key as keyof CustomCommandFrontmatter] = value.replace(
        /['"]/g,
        '',
      ) as any
    }
  }

  // Handle final array if we ended in one
  if (inArray && currentKey) {
    frontmatter[currentKey as keyof CustomCommandFrontmatter] =
      arrayItems as any
  }

  return { frontmatter, content: markdownContent }
}

/**
 * Scan for markdown files using ripgrep-like tool
 */
async function scanMarkdownFiles(
  args: string[],
  directory: string,
  signal: AbortSignal,
): Promise<string[]> {
  try {
    // Use find command as fallback since we don't have rg available
    const { stdout } = await execFileAsync(
      'find',
      [directory, '-name', '*.md', '-type', 'f'],
      { signal, timeout: 3000 },
    )
    return stdout
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
  } catch (error) {
    // If find fails or directory doesn't exist, return empty array
    return []
  }
}

/**
 * Create a Command object from custom command file data
 */
function createCustomCommand(
  frontmatter: CustomCommandFrontmatter,
  content: string,
  filePath: string,
  baseDir: string,
): Command | null {
  // Extract command name with namespace support
  const relativePath = filePath.replace(baseDir + '/', '')
  const pathParts = relativePath.split('/')
  const fileName = pathParts[pathParts.length - 1].replace('.md', '')

  // Create namespace if command is in subdirectory
  let name: string
  if (pathParts.length > 1) {
    const namespace = pathParts.slice(0, -1).join(':')
    name = frontmatter.name || `${namespace}:${fileName}`
  } else {
    name = frontmatter.name || fileName
  }

  const description = frontmatter.description || `Custom command: ${name}`
  const enabled = frontmatter.enabled !== false // Default to true
  const hidden = frontmatter.hidden === true // Default to false
  const aliases = frontmatter.aliases || []
  const progressMessage = frontmatter.progressMessage || `Running ${name}...`
  const argNames = frontmatter.argNames

  if (!name) {
    console.warn(`Custom command file ${filePath} has no name, skipping`)
    return null
  }

  const command: Command = {
    type: 'prompt',
    name,
    description,
    isEnabled: enabled,
    isHidden: hidden,
    aliases,
    progressMessage,
    argNames,
    userFacingName(): string {
      return name
    },
    async getPromptForCommand(args: string): Promise<MessageParam[]> {
      // Validate allowed tools first
      if (!validateAllowedTools(frontmatter['allowed-tools'])) {
        throw new Error(
          'Command execution not allowed due to tool restrictions',
        )
      }

      let prompt = content.trim()

      // NOTE: Dynamic content processing (! and @) should be done at execution time
      // not at prompt generation time, to ensure proper security context
      // For now, we'll mark where these should be processed later

      // Step 1: Handle $ARGUMENTS placeholder (official Claude Code format)
      if (prompt.includes('$ARGUMENTS')) {
        prompt = prompt.replace(/\$ARGUMENTS/g, args || '')
      }

      // Step 2: Legacy support: Replace argument placeholders if argNames are defined
      if (argNames && argNames.length > 0) {
        const argValues = args.trim().split(/\s+/)
        argNames.forEach((argName, index) => {
          const value = argValues[index] || ''
          prompt = prompt.replace(new RegExp(`\\{${argName}\\}`, 'g'), value)
        })
      }

      // Step 3: If args are provided but no placeholders used, append args to the prompt
      if (
        args.trim() &&
        !prompt.includes('$ARGUMENTS') &&
        (!argNames || argNames.length === 0)
      ) {
        prompt += `\n\nAdditional context: ${args}`
      }

      return [
        {
          role: 'user',
          content: prompt,
        },
      ]
    },
  }

  return command
}

/**
 * Load custom commands from .claude/commands/ directories
 */
export const loadCustomCommands = memoize(
  async (): Promise<Command[]> => {
    const userCommandsDir = join(homedir(), '.claude', 'commands')
    const projectCommandsDir = join(getCwd(), '.claude', 'commands')

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 3000)

    try {
      const startTime = Date.now()

      // Scan both directories for .md files
      const [projectFiles, userFiles] = await Promise.all([
        existsSync(projectCommandsDir)
          ? scanMarkdownFiles(
              ['--files', '--hidden', '--glob', '*.md'],
              projectCommandsDir,
              abortController.signal,
            )
          : Promise.resolve([]),
        existsSync(userCommandsDir)
          ? scanMarkdownFiles(
              ['--files', '--glob', '*.md'],
              userCommandsDir,
              abortController.signal,
            )
          : Promise.resolve([]),
      ])

      const allFiles = [...projectFiles, ...userFiles]
      const duration = Date.now() - startTime

      // Log performance metrics
      logEvent('tengu_custom_command_scan', {
        durationMs: duration,
        projectFilesFound: projectFiles.length,
        userFilesFound: userFiles.length,
        totalFiles: allFiles.length,
      })

      // Parse files and create command objects
      const commands: Command[] = []

      // Process project files
      for (const filePath of projectFiles) {
        try {
          const content = readFileSync(filePath, { encoding: 'utf-8' })
          const { frontmatter, content: commandContent } =
            parseFrontmatter(content)
          const command = createCustomCommand(
            frontmatter,
            commandContent,
            filePath,
            projectCommandsDir,
          )

          if (command) {
            commands.push(command)
          }
        } catch (error) {
          console.warn(`Failed to load custom command from ${filePath}:`, error)
        }
      }

      // Process user files
      for (const filePath of userFiles) {
        try {
          const content = readFileSync(filePath, { encoding: 'utf-8' })
          const { frontmatter, content: commandContent } =
            parseFrontmatter(content)
          const command = createCustomCommand(
            frontmatter,
            commandContent,
            filePath,
            userCommandsDir,
          )

          if (command) {
            commands.push(command)
          }
        } catch (error) {
          console.warn(`Failed to load custom command from ${filePath}:`, error)
        }
      }

      // Filter enabled commands and log results
      const enabledCommands = commands.filter(cmd => cmd.isEnabled)

      logEvent('tengu_custom_commands_loaded', {
        totalCommands: commands.length,
        enabledCommands: enabledCommands.length,
        userCommands: commands.filter(
          cmd => cmd.name && userFiles.some(f => f.includes(cmd.name)),
        ).length,
        projectCommands: commands.filter(
          cmd => cmd.name && projectFiles.some(f => f.includes(cmd.name)),
        ).length,
      })

      return enabledCommands
    } catch (error) {
      console.warn('Failed to load custom commands:', error)
      return []
    } finally {
      clearTimeout(timeout)
    }
  },
  // Memoize based on current working directory and timestamp
  () => {
    const cwd = getCwd()
    const userDir = join(homedir(), '.claude', 'commands')
    const projectDir = join(cwd, '.claude', 'commands')

    // Simple cache key that includes directory existence
    return `${cwd}:${existsSync(userDir)}:${existsSync(projectDir)}:${Date.now()}`
  },
)

/**
 * Get custom command directories for help/info purposes
 */
export function getCustomCommandDirectories(): {
  user: string
  project: string
} {
  return {
    user: join(homedir(), '.claude', 'commands'),
    project: join(getCwd(), '.claude', 'commands'),
  }
}

/**
 * Check if custom commands are available
 */
export function hasCustomCommands(): boolean {
  const { user, project } = getCustomCommandDirectories()
  return existsSync(user) || existsSync(project)
}
