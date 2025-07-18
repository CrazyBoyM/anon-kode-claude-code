import { Message } from '../query'
import { countTokens } from './tokens'
import { getMessagesGetter, getMessagesSetter } from '../messages'
import { getContext } from '../context'
import { getCodeStyle } from '../utils/style'
import { clearTerminal } from '../utils/terminal'
import { resetFileFreshnessSession } from '../services/fileFreshness'
import { createUserMessage, normalizeMessagesForAPI } from '../utils/messages'
import { querySonnet } from '../services/claude'
import { selectAndReadFiles } from './fileRecoveryCore'
import { addLineNumbers } from './file'
import { getGlobalConfig } from './config'

/**
 * Auto-compact threshold ratio matching original Claude Code implementation
 * Corresponds to Y01 constant in reverse-engineered source (line 53580)
 */
const AUTO_COMPACT_THRESHOLD_RATIO = 0.92

/**
 * Retrieves the maximum context tokens from model configuration
 * Falls back to 200k if not configured in smallModelContextLength
 */
async function getMaxContextTokens(): Promise<number> {
  try {
    const config = await getGlobalConfig()
    return config.smallModelContextLength || 200_000
  } catch (error) {
    return 200_000
  }
}

const COMPRESSION_PROMPT = `Please provide a comprehensive summary of our conversation structured as follows:

## Technical Context
Development environment, tools, frameworks, and configurations in use. Programming languages, libraries, and technical constraints. File structure, directory organization, and project architecture.

## Project Overview  
Main project goals, features, and scope. Key components, modules, and their relationships. Data models, APIs, and integration patterns.

## Code Changes
Files created, modified, or analyzed during our conversation. Specific code implementations, functions, and algorithms added. Configuration changes and structural modifications.

## Debugging & Issues
Problems encountered and their root causes. Solutions implemented and their effectiveness. Error messages, logs, and diagnostic information.

## Current Status
What we just completed successfully. Current state of the codebase and any ongoing work. Test results, validation steps, and verification performed.

## Pending Tasks
Immediate next steps and priorities. Planned features, improvements, and refactoring. Known issues, technical debt, and areas needing attention.

## User Preferences
Coding style, formatting, and organizational preferences. Communication patterns and feedback style. Tool choices and workflow preferences.

## Key Decisions
Important technical decisions made and their rationale. Alternative approaches considered and why they were rejected. Trade-offs accepted and their implications.

Focus on information essential for continuing the conversation effectively, including specific details about code, files, errors, and plans.`

/**
 * Calculates context usage thresholds based on model configuration
 * Mirrors original W01 function from Claude Code implementation
 */
async function calculateThresholds(tokenCount: number) {
  const contextLimit = await getMaxContextTokens()
  const autoCompactThreshold = contextLimit * AUTO_COMPACT_THRESHOLD_RATIO

  return {
    isAboveAutoCompactThreshold: tokenCount >= autoCompactThreshold,
    percentUsed: Math.round((tokenCount / contextLimit) * 100),
    tokensRemaining: Math.max(0, autoCompactThreshold - tokenCount),
    contextLimit,
  }
}

/**
 * Determines if auto-compact should trigger based on token usage
 * Mirrors original OL6 function with minimum message count safeguard
 */
async function shouldAutoCompact(messages: Message[]): Promise<boolean> {
  if (messages.length < 3) return false

  const tokenCount = countTokens(messages)
  const { isAboveAutoCompactThreshold } = await calculateThresholds(tokenCount)

  return isAboveAutoCompactThreshold
}

/**
 * Main auto-compact entry point, mirrors original fT2 function
 * Executes compression when token threshold is exceeded, with graceful fallback
 * This function is called at line 161 in query.ts, matching original integration point
 */
export async function checkAutoCompact(
  messages: Message[],
  toolUseContext: any,
): Promise<{ messages: Message[]; wasCompacted: boolean }> {
  if (!(await shouldAutoCompact(messages))) {
    return { messages, wasCompacted: false }
  }

  try {
    const compactedMessages = await executeAutoCompact(messages, toolUseContext)

    return {
      messages: compactedMessages,
      wasCompacted: true,
    }
  } catch (error) {
    // Graceful degradation: if auto-compact fails, continue with original messages
    // This ensures system remains functional even if compression encounters issues
    console.error(
      'Auto-compact failed, continuing with original messages:',
      error,
    )
    return { messages, wasCompacted: false }
  }
}

/**
 * Executes the compression process programmatically
 * Mirrors the manual /compact command but optimized for automatic execution
 * Includes file recovery mechanism based on qL6 algorithm from original implementation
 */
async function executeAutoCompact(
  messages: Message[],
  toolUseContext: any,
): Promise<Message[]> {
  const summaryRequest = createUserMessage(COMPRESSION_PROMPT)

  const summaryResponse = await querySonnet(
    normalizeMessagesForAPI([...messages, summaryRequest]),
    [
      'You are a helpful AI assistant tasked with creating comprehensive conversation summaries that preserve all essential context for continuing development work.',
    ],
    0,
    toolUseContext.options.tools,
    toolUseContext.abortController.signal,
    {
      dangerouslySkipPermissions: false,
      model: toolUseContext.options.slowAndCapableModel,
      prependCLISysprompt: true,
    },
  )

  const content = summaryResponse.message.content
  const summary =
    typeof content === 'string'
      ? content
      : content.length > 0 && content[0]?.type === 'text'
        ? content[0].text
        : null

  if (!summary) {
    throw new Error(
      'Failed to generate conversation summary - response did not contain valid text content',
    )
  }

  summaryResponse.message.usage = {
    input_tokens: 0,
    output_tokens: summaryResponse.message.usage.output_tokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }

  // File recovery mechanism: automatically recover recently accessed files
  // This mirrors the qL6 file selection algorithm from original Claude Code
  const recoveredFiles = await selectAndReadFiles()

  const compactedMessages = [
    createUserMessage(
      'Context automatically compressed due to token limit. Essential information preserved.',
    ),
    summaryResponse,
  ]

  // Append recovered files to maintain development context
  // Files are selected by recency and importance, with token budget enforcement
  if (recoveredFiles.length > 0) {
    for (const file of recoveredFiles) {
      const contentWithLines = addLineNumbers({
        content: file.content,
        startLine: 1,
      })
      const recoveryMessage = createUserMessage(
        `**Recovered File: ${file.path}**\n\n\`\`\`\n${contentWithLines}\n\`\`\`\n\n` +
          `*Automatically recovered (${file.tokens} tokens)${file.truncated ? ' [truncated]' : ''}*`,
      )
      compactedMessages.push(recoveryMessage)
    }
  }

  // State cleanup to ensure fresh context after compression
  // Mirrors the cleanup sequence from manual /compact command
  getMessagesSetter()([])
  getContext.cache.clear?.()
  getCodeStyle.cache.clear?.()
  resetFileFreshnessSession()

  return compactedMessages
}
