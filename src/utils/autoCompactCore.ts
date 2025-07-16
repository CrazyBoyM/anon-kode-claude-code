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
 * Threshold ratio for triggering automatic context compression
 * When context usage exceeds 92% of the model's limit, auto-compact activates
 */
const AUTO_COMPACT_THRESHOLD_RATIO = 0.92

/**
 * Retrieves the context length for the large model that should execute compression
 * Uses largeModelContextLength since compression is a complex task requiring a capable model
 * Falls back to smallModelContextLength if large model is not configured
 */
async function getCompressionModelContextLimit(): Promise<number> {
  try {
    const config = await getGlobalConfig()
    // Use large model context length for compression tasks
    // Fall back to small model if large model is not configured
    return (
      config.largeModelContextLength ||
      config.smallModelContextLength ||
      200_000
    )
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
 * Calculates context usage thresholds based on the large model's capabilities
 * Uses the large model context length since compression tasks require a capable model
 */
async function calculateThresholds(tokenCount: number) {
  const contextLimit = await getCompressionModelContextLimit()
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
 * Uses the large model context limit since compression requires a capable model
 */
async function shouldAutoCompact(messages: Message[]): Promise<boolean> {
  if (messages.length < 3) return false

  const tokenCount = countTokens(messages)
  const { isAboveAutoCompactThreshold } = await calculateThresholds(tokenCount)

  return isAboveAutoCompactThreshold
}

/**
 * Main entry point for automatic context compression
 *
 * This function is called before each query to check if the conversation
 * has grown too large and needs compression. When triggered, it:
 * - Generates a structured summary of the conversation using the large model
 * - Recovers recently accessed files to maintain development context
 * - Resets conversation state while preserving essential information
 *
 * Uses the large model for compression tasks to ensure high-quality summaries
 *
 * @param messages Current conversation messages
 * @param toolUseContext Execution context with model and tool configuration
 * @returns Updated messages (compressed if needed) and compression status
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
 * Executes the conversation compression process using the large model
 *
 * This function generates a comprehensive summary using the large model
 * which is better suited for complex summarization tasks. It also
 * automatically recovers important files to maintain development context.
 */
async function executeAutoCompact(
  messages: Message[],
  toolUseContext: any,
): Promise<Message[]> {
  const summaryRequest = createUserMessage(COMPRESSION_PROMPT)

  // Get the large model for compression task
  const config = await getGlobalConfig()
  const compressionModel =
    config.largeModelName || toolUseContext.options.slowAndCapableModel

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
      model: compressionModel,
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

  // Automatic file recovery: preserve recently accessed development files
  // This maintains coding context even after conversation compression
  const recoveredFiles = await selectAndReadFiles()

  const compactedMessages = [
    createUserMessage(
      'Context automatically compressed due to token limit. Essential information preserved.',
    ),
    summaryResponse,
  ]

  // Append recovered files to maintain development workflow continuity
  // Files are prioritized by recency and importance, with strict token limits
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
