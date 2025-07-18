import '@anthropic-ai/sdk/shims/node'
import Anthropic, { APIConnectionError, APIError } from '@anthropic-ai/sdk'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'
import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import chalk from 'chalk'
import { createHash, randomUUID } from 'crypto'
import 'dotenv/config'

import { addToTotalCost } from '../cost-tracker'
import models from '../constants/models'
import type { AssistantMessage, UserMessage } from '../query'
import { Tool } from '../Tool'
import {
  getAnthropicApiKey,
  getOrCreateUserID,
  getGlobalConfig,
  getActiveApiKey,
  markApiKeyAsFailed,
} from '../utils/config'
import { logError, SESSION_ID } from '../utils/log'
import { USER_AGENT } from '../utils/http'
import {
  createAssistantAPIErrorMessage,
  normalizeContentFromAPI,
} from '../utils/messages.js'
import { countTokens } from '../utils/tokens'
import { logEvent } from './statsig'
import { withVCR } from './vcr'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream.mjs'
import type {
  Message as APIMessage,
  MessageParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { SMALL_FAST_MODEL, USE_BEDROCK, USE_VERTEX } from '../utils/model'
import { getCLISyspromptPrefix } from '../constants/prompts'
import { getVertexRegionForModel } from '../utils/model'
import OpenAI from 'openai'
import type { ChatCompletionStream } from 'openai/lib/ChatCompletionStream'
import { ContentBlock } from '@anthropic-ai/sdk/resources/messages/messages'
import { nanoid } from 'nanoid'
import { getCompletion } from './openai'
import { getReasoningEffort } from '../utils/thinking'
import { generateSystemReminders } from './systemReminder'

interface StreamResponse extends APIMessage {
  ttftMs?: number
}

export const API_ERROR_MESSAGE_PREFIX = 'API Error'
export const PROMPT_TOO_LONG_ERROR_MESSAGE = 'Prompt is too long'
export const CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE = 'Credit balance is too low'
export const INVALID_API_KEY_ERROR_MESSAGE =
  'Invalid API key · Please run /login'
export const NO_CONTENT_MESSAGE = '(no content)'
const PROMPT_CACHING_ENABLED = !process.env.DISABLE_PROMPT_CACHING

// @see https://docs.anthropic.com/en/docs/about-claude/models#model-comparison-table
const HAIKU_COST_PER_MILLION_INPUT_TOKENS = 0.8
const HAIKU_COST_PER_MILLION_OUTPUT_TOKENS = 4
const HAIKU_COST_PER_MILLION_PROMPT_CACHE_WRITE_TOKENS = 1
const HAIKU_COST_PER_MILLION_PROMPT_CACHE_READ_TOKENS = 0.08

const SONNET_COST_PER_MILLION_INPUT_TOKENS = 3
const SONNET_COST_PER_MILLION_OUTPUT_TOKENS = 15
const SONNET_COST_PER_MILLION_PROMPT_CACHE_WRITE_TOKENS = 3.75
const SONNET_COST_PER_MILLION_PROMPT_CACHE_READ_TOKENS = 0.3

export const MAIN_QUERY_TEMPERATURE = 1 // to get more variation for binary feedback

function getMetadata() {
  return {
    user_id: `${getOrCreateUserID()}_${SESSION_ID}`,
  }
}

const MAX_RETRIES = process.env.USER_TYPE === 'SWE_BENCH' ? 100 : 10
const BASE_DELAY_MS = 500

interface RetryOptions {
  maxRetries?: number
}

function getRetryDelay(
  attempt: number,
  retryAfterHeader?: string | null,
): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!isNaN(seconds)) {
      return seconds * 1000
    }
  }
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 32000) // Max 32s delay
}

function shouldRetry(error: APIError): boolean {
  // Check for overloaded errors first and only retry for SWE_BENCH
  if (error.message?.includes('"type":"overloaded_error"')) {
    return process.env.USER_TYPE === 'SWE_BENCH'
  }

  // Note this is not a standard header.
  const shouldRetryHeader = error.headers?.['x-should-retry']

  // If the server explicitly says whether or not to retry, obey.
  if (shouldRetryHeader === 'true') return true
  if (shouldRetryHeader === 'false') return false

  if (error instanceof APIConnectionError) {
    return true
  }

  if (!error.status) return false

  // Retry on request timeouts.
  if (error.status === 408) return true

  // Retry on lock timeouts.
  if (error.status === 409) return true

  // Retry on rate limits.
  if (error.status === 429) return true

  // Retry internal errors.
  if (error.status && error.status >= 500) return true

  return false
}

async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES
  let lastError: unknown

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      // Only retry if the error indicates we should
      if (
        attempt > maxRetries ||
        !(error instanceof APIError) ||
        !shouldRetry(error)
      ) {
        throw error
      }
      // Get retry-after header if available
      const retryAfter = error.headers?.['retry-after'] ?? null
      const delayMs = getRetryDelay(attempt, retryAfter)

      console.log(
        `  ⎿  ${chalk.red(`API ${error.name} (${error.message}) · Retrying in ${Math.round(delayMs / 1000)} seconds… (attempt ${attempt}/${maxRetries})`)}`,
      )

      logEvent('tengu_api_retry', {
        attempt: String(attempt),
        delayMs: String(delayMs),
        error: error.message,
        status: String(error.status),
        provider: USE_BEDROCK ? 'bedrock' : USE_VERTEX ? 'vertex' : '1p',
      })

      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}

/**
 * Fetch available models from Anthropic API
 */
export async function fetchAnthropicModels(
  baseURL: string,
  apiKey: string,
): Promise<any[]> {
  try {
    // Use provided baseURL or default to official Anthropic API
    const modelsURL = baseURL
      ? `${baseURL.replace(/\/+$/, '')}/v1/models`
      : 'https://api.anthropic.com/v1/models'

    const response = await fetch(modelsURL, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': USER_AGENT,
      },
    })

    if (!response.ok) {
      // Provide user-friendly error messages based on status code
      if (response.status === 401) {
        throw new Error(
          'Invalid API key. Please check your Anthropic API key and try again.',
        )
      } else if (response.status === 403) {
        throw new Error(
          'API key does not have permission to access models. Please check your API key permissions.',
        )
      } else if (response.status === 429) {
        throw new Error(
          'Too many requests. Please wait a moment and try again.',
        )
      } else if (response.status >= 500) {
        throw new Error(
          'Anthropic service is temporarily unavailable. Please try again later.',
        )
      } else {
        throw new Error(
          `Unable to connect to Anthropic API (${response.status}). Please check your internet connection and API key.`,
        )
      }
    }

    const data = await response.json()
    return data.data || []
  } catch (error) {
    // If it's already our custom error, pass it through
    if (
      (error instanceof Error && error.message.includes('API key')) ||
      (error instanceof Error && error.message.includes('Anthropic'))
    ) {
      throw error
    }

    // For network errors or other issues
    console.error('Failed to fetch Anthropic models:', error)
    throw new Error(
      'Unable to connect to Anthropic API. Please check your internet connection and try again.',
    )
  }
}

export async function verifyApiKey(
  apiKey: string,
  baseURL?: string,
): Promise<boolean> {
  const clientConfig: any = {
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 3,
    defaultHeaders: {
      'User-Agent': USER_AGENT,
    },
  }

  // Add baseURL if provided (for third-party Anthropic-compatible APIs)
  if (baseURL) {
    clientConfig.baseURL = baseURL
  }

  const anthropic = new Anthropic(clientConfig)

  try {
    await withRetry(
      async () => {
        // Use Claude model for Anthropic-compatible APIs, otherwise use the configured model
        const model = baseURL ? 'claude-sonnet-4-20250514' : SMALL_FAST_MODEL
        const messages: MessageParam[] = [{ role: 'user', content: 'test' }]
        await anthropic.messages.create({
          model,
          max_tokens: 1,
          messages,
          temperature: 0,
          metadata: getMetadata(),
        })
        return true
      },
      { maxRetries: 2 }, // Use fewer retries for API key verification
    )
    return true
  } catch (error) {
    logError(error)
    // Check for authentication error
    if (
      error instanceof Error &&
      error.message.includes(
        '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
      )
    ) {
      return false
    }
    throw error
  }
}

function convertAnthropicMessagesToOpenAIMessages(
  messages: (UserMessage | AssistantMessage)[],
): (
  | OpenAI.ChatCompletionMessageParam
  | OpenAI.ChatCompletionToolMessageParam
)[] {
  const openaiMessages: (
    | OpenAI.ChatCompletionMessageParam
    | OpenAI.ChatCompletionToolMessageParam
  )[] = []

  const toolResults: Record<string, OpenAI.ChatCompletionToolMessageParam> = {}

  for (const message of messages) {
    let contentBlocks = []
    if (typeof message.message.content === 'string') {
      contentBlocks = [
        {
          type: 'text',
          text: message.message.content,
        },
      ]
    } else if (!Array.isArray(message.message.content)) {
      contentBlocks = [message.message.content]
    } else {
      contentBlocks = message.message.content
    }

    for (const block of contentBlocks) {
      if (block.type === 'text') {
        openaiMessages.push({
          role: message.message.role,
          content: block.text,
        })
      } else if (block.type === 'tool_use') {
        openaiMessages.push({
          role: 'assistant',
          content: undefined,
          tool_calls: [
            {
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
              id: block.id,
            },
          ],
        })
      } else if (block.type === 'tool_result') {
        // Ensure content is always a string for role:tool messages
        let toolContent = block.content
        if (typeof toolContent !== 'string') {
          // Convert content to string if it's not already
          toolContent = JSON.stringify(toolContent)
        }

        toolResults[block.tool_use_id] = {
          role: 'tool',
          content: toolContent,
          tool_call_id: block.tool_use_id,
        }
      }
    }
  }

  const finalMessages: (
    | OpenAI.ChatCompletionMessageParam
    | OpenAI.ChatCompletionToolMessageParam
  )[] = []

  for (const message of openaiMessages) {
    finalMessages.push(message)

    if ('tool_calls' in message && message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolResults[toolCall.id]) {
          finalMessages.push(toolResults[toolCall.id])
        }
      }
    }
  }

  return finalMessages
}

function messageReducer(
  previous: OpenAI.ChatCompletionMessage,
  item: OpenAI.ChatCompletionChunk,
): OpenAI.ChatCompletionMessage {
  const reduce = (acc: any, delta: OpenAI.ChatCompletionChunk.Choice.Delta) => {
    acc = { ...acc }
    for (const [key, value] of Object.entries(delta)) {
      if (acc[key] === undefined || acc[key] === null) {
        acc[key] = value
        //  OpenAI.Chat.Completions.ChatCompletionMessageToolCall does not have a key, .index
        if (Array.isArray(acc[key])) {
          for (const arr of acc[key]) {
            delete arr.index
          }
        }
      } else if (typeof acc[key] === 'string' && typeof value === 'string') {
        acc[key] += value
      } else if (typeof acc[key] === 'number' && typeof value === 'number') {
        acc[key] = value
      } else if (Array.isArray(acc[key]) && Array.isArray(value)) {
        const accArray = acc[key]
        for (let i = 0; i < value.length; i++) {
          const { index, ...chunkTool } = value[i]
          if (index - accArray.length > 1) {
            throw new Error(
              `Error: An array has an empty value when tool_calls are constructed. tool_calls: ${accArray}; tool: ${value}`,
            )
          }
          accArray[index] = reduce(accArray[index], chunkTool)
        }
      } else if (typeof acc[key] === 'object' && typeof value === 'object') {
        acc[key] = reduce(acc[key], value)
      }
    }
    return acc
  }

  const choice = item.choices?.[0]
  if (!choice) {
    // chunk contains information about usage and token counts
    return previous
  }
  return reduce(previous, choice.delta) as OpenAI.ChatCompletionMessage
}
async function handleMessageStream(
  stream: ChatCompletionStream,
): Promise<OpenAI.ChatCompletion> {
  const streamStartTime = Date.now()
  let ttftMs: number | undefined

  let message = {} as OpenAI.ChatCompletionMessage

  let id, model, created, object, usage
  for await (const chunk of stream) {
    if (!id) {
      id = chunk.id
    }
    if (!model) {
      model = chunk.model
    }
    if (!created) {
      created = chunk.created
    }
    if (!object) {
      object = chunk.object
    }
    if (!usage) {
      usage = chunk.usage
    }
    message = messageReducer(message, chunk)
    if (chunk?.choices?.[0]?.delta?.content) {
      ttftMs = Date.now() - streamStartTime
    }
  }
  return {
    id,
    created,
    model,
    object,
    choices: [
      {
        index: 0,
        message,
        finish_reason: 'stop',
        logprobs: undefined,
      },
    ],
    usage,
  }
}

function convertOpenAIResponseToAnthropic(response: OpenAI.ChatCompletion) {
  let contentBlocks: ContentBlock[] = []
  const message = response.choices?.[0]?.message
  if (!message) {
    logEvent('weird_response', {
      response: JSON.stringify(response),
    })
    return {
      role: 'assistant',
      content: [],
      stop_reason: response.choices?.[0]?.finish_reason,
      type: 'message',
      usage: response.usage,
    }
  }

  if (message?.tool_calls) {
    for (const toolCall of message.tool_calls) {
      const tool = toolCall.function
      const toolName = tool.name
      let toolArgs = {}
      try {
        toolArgs = JSON.parse(tool.arguments)
      } catch (e) {
        // console.log(e)
      }

      contentBlocks.push({
        type: 'tool_use',
        input: toolArgs,
        name: toolName,
        id: toolCall.id?.length > 0 ? toolCall.id : nanoid(),
      })
    }
  }

  if ((message as any).reasoning) {
    contentBlocks.push({
      type: 'thinking',
      thinking: (message as any).reasoning,
      signature: '',
    })
  }

  // NOTE: For deepseek api, the key for its returned reasoning process is reasoning_content
  if ((message as any).reasoning_content) {
    contentBlocks.push({
      type: 'thinking',
      thinking: (message as any).reasoning_content,
      signature: '',
    })
  }

  if (message.content) {
    contentBlocks.push({
      type: 'text',
      text: message?.content,
      citations: [],
    })
  }

  const finalMessage = {
    role: 'assistant',
    content: contentBlocks,
    stop_reason: response.choices?.[0]?.finish_reason,
    type: 'message',
    usage: response.usage,
  }

  return finalMessage
}

let anthropicClient: Anthropic | AnthropicBedrock | AnthropicVertex | null =
  null

/**
 * Get the Anthropic client, creating it if it doesn't exist
 */
export function getAnthropicClient(
  model?: string,
): Anthropic | AnthropicBedrock | AnthropicVertex {
  const config = getGlobalConfig()
  const provider = config.primaryProvider

  // Reset client if provider has changed to ensure correct configuration
  if (anthropicClient && provider) {
    // Always recreate client for provider-specific configurations
    anthropicClient = null
  }

  if (anthropicClient) {
    return anthropicClient
  }

  const region = getVertexRegionForModel(model)

  const defaultHeaders: { [key: string]: string } = {
    'x-app': 'cli',
    'User-Agent': USER_AGENT,
  }
  if (process.env.ANTHROPIC_AUTH_TOKEN) {
    defaultHeaders['Authorization'] =
      `Bearer ${process.env.ANTHROPIC_AUTH_TOKEN}`
  }

  const ARGS = {
    defaultHeaders,
    maxRetries: 0, // Disabled auto-retry in favor of manual implementation
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(60 * 1000), 10),
  }
  if (USE_BEDROCK) {
    const client = new AnthropicBedrock(ARGS)
    anthropicClient = client
    return client
  }
  if (USE_VERTEX) {
    const vertexArgs = {
      ...ARGS,
      region: region || process.env.CLOUD_ML_REGION || 'us-east5',
    }
    const client = new AnthropicVertex(vertexArgs)
    anthropicClient = client
    return client
  }

  // Get appropriate API key and baseURL based on provider
  let apiKey: string
  let baseURL: string | undefined

  if (provider === 'bigdream') {
    apiKey = getActiveApiKey(config, 'large') || ''
    baseURL = config.largeModelBaseURL || 'https://api-key.info'
  } else if (provider === 'opendev') {
    apiKey = getActiveApiKey(config, 'large') || ''
    baseURL = config.largeModelBaseURL || 'https://api.openai-next.com'
  } else {
    // Default anthropic provider
    apiKey = getAnthropicApiKey()
    baseURL = undefined // Use default Anthropic API
  }

  if (process.env.USER_TYPE === 'ant' && !apiKey && provider === 'anthropic') {
    console.error(
      chalk.red(
        '[ANT-ONLY] Please set the ANTHROPIC_API_KEY environment variable to use the CLI. To create a new key, go to https://console.anthropic.com/settings/keys.',
      ),
    )
  }

  // Create client with custom baseURL for BigDream/OpenDev
  // Anthropic SDK will append the appropriate paths (like /v1/messages)
  const clientConfig = {
    apiKey,
    dangerouslyAllowBrowser: true,
    ...ARGS,
    ...(baseURL && { baseURL }), // Use baseURL directly, SDK will handle API versioning
  }

  anthropicClient = new Anthropic(clientConfig)
  return anthropicClient
}

/**
 * Reset the Anthropic client to null, forcing a new client to be created on next use
 */
export function resetAnthropicClient(): void {
  anthropicClient = null
}

/**
 * Environment variables for different client types:
 *
 * Direct API:
 * - ANTHROPIC_API_KEY: Required for direct API access
 *
 * AWS Bedrock:
 * - AWS credentials configured via aws-sdk defaults
 *
 * Vertex AI:
 * - Model-specific region variables (highest priority):
 *   - VERTEX_REGION_CLAUDE_3_5_HAIKU: Region for Claude 3.5 Haiku model
 *   - VERTEX_REGION_CLAUDE_3_5_SONNET: Region for Claude 3.5 Sonnet model
 *   - VERTEX_REGION_CLAUDE_3_7_SONNET: Region for Claude 3.7 Sonnet model
 * - CLOUD_ML_REGION: Optional. The default GCP region to use for all models
 *   If specific model region not specified above
 * - ANTHROPIC_VERTEX_PROJECT_ID: Required. Your GCP project ID
 * - Standard GCP credentials configured via google-auth-library
 *
 * Priority for determining region:
 * 1. Hardcoded model-specific environment variables
 * 2. Global CLOUD_ML_REGION variable
 * 3. Default region from config
 * 4. Fallback region (us-east5)
 */

export function userMessageToMessageParam(
  message: UserMessage,
  addCache = false,
): MessageParam {
  if (addCache) {
    if (typeof message.message.content === 'string') {
      return {
        role: 'user',
        content: [
          {
            type: 'text',
            text: message.message.content,
            ...(PROMPT_CACHING_ENABLED
              ? { cache_control: { type: 'ephemeral' } }
              : {}),
          },
        ],
      }
    } else {
      return {
        role: 'user',
        content: message.message.content.map((_, i) => ({
          ..._,
          ...(i === message.message.content.length - 1
            ? PROMPT_CACHING_ENABLED
              ? { cache_control: { type: 'ephemeral' } }
              : {}
            : {}),
        })),
      }
    }
  }
  return {
    role: 'user',
    content: message.message.content,
  }
}

export function assistantMessageToMessageParam(
  message: AssistantMessage,
  addCache = false,
): MessageParam {
  if (addCache) {
    if (typeof message.message.content === 'string') {
      return {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: message.message.content,
            ...(PROMPT_CACHING_ENABLED
              ? { cache_control: { type: 'ephemeral' } }
              : {}),
          },
        ],
      }
    } else {
      return {
        role: 'assistant',
        content: message.message.content.map((_, i) => ({
          ..._,
          ...(i === message.message.content.length - 1 &&
          _.type !== 'thinking' &&
          _.type !== 'redacted_thinking'
            ? PROMPT_CACHING_ENABLED
              ? { cache_control: { type: 'ephemeral' } }
              : {}
            : {}),
        })),
      }
    }
  }
  return {
    role: 'assistant',
    content: message.message.content,
  }
}

function splitSysPromptPrefix(systemPrompt: string[]): string[] {
  // split out the first block of the system prompt as the "prefix" for API
  // to match on in https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_cli_system_prompt_prefixes
  const systemPromptFirstBlock = systemPrompt[0] || ''
  const systemPromptRest = systemPrompt.slice(1)
  return [systemPromptFirstBlock, systemPromptRest.join('\n')].filter(Boolean)
}

export async function querySonnet(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  maxThinkingTokens: number,
  tools: Tool[],
  signal: AbortSignal,
  options: {
    dangerouslySkipPermissions: boolean
    model: string
    prependCLISysprompt: boolean
  },
): Promise<AssistantMessage> {
  return await withVCR(messages, () =>
    querySonnetWithPromptCaching(
      messages,
      systemPrompt,
      maxThinkingTokens,
      tools,
      signal,
      options,
    ),
  )
}

export function formatSystemPromptWithContext(
  systemPrompt: string[],
  context: { [k: string]: string },
  agentId?: string,
): { systemPrompt: string[]; reminders: string } {
  // Build the enhanced system prompt
  const enhancedPrompt = [...systemPrompt]
  let reminders = ''

  // Only inject reminders when context is present (matching original behavior)
  const hasContext = Object.entries(context).length > 0

  if (hasContext) {
    // Generate reminders but return them separately instead of injecting into system prompt
    const reminderMessages = generateSystemReminders(true, agentId)

    // CLAUDE.md context as reminder (aligning with target system behavior - 58.8% of reminders)
    if (context.projectDocs) {
      reminders += `<system-reminder>\nAs you answer the user's questions, you can use the following context:\n# claudeMd\n${context.projectDocs}\n</system-reminder>\n`
    }

    // Other dynamic reminders (todo, security, performance)
    if (reminderMessages.length > 0) {
      reminders += reminderMessages.map(r => r.content).join('\n') + '\n'
    }

    // Add context to system prompt (excluding projectDocs since it's handled as reminder)
    enhancedPrompt.push(
      `\nAs you answer the user's questions, you can use the following context:\n`,
    )

    const filteredContext = Object.fromEntries(
      Object.entries(context).filter(([key]) => key !== 'projectDocs'),
    )

    enhancedPrompt.push(
      ...Object.entries(filteredContext).map(
        ([key, value]) => `<context name="${key}">${value}</context>`,
      ),
    )
  }

  return { systemPrompt: enhancedPrompt, reminders }
}

async function querySonnetWithPromptCaching(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  maxThinkingTokens: number,
  tools: Tool[],
  signal: AbortSignal,
  options: {
    dangerouslySkipPermissions: boolean
    model: string
    prependCLISysprompt: boolean
  },
): Promise<AssistantMessage> {
  const config = getGlobalConfig()
  const provider = config.primaryProvider

  // Use native Anthropic SDK for Anthropic and Anthropic-compatible providers
  if (
    provider === 'anthropic' ||
    provider === 'bigdream' ||
    provider === 'opendev'
  ) {
    return queryAnthropicNative(
      'large',
      messages,
      systemPrompt,
      maxThinkingTokens,
      tools,
      signal,
      options,
    )
  }

  // Use OpenAI-compatible interface for all other providers (including custom Anthropic endpoints)
  return queryOpenAI(
    'large',
    messages,
    systemPrompt,
    maxThinkingTokens,
    tools,
    signal,
    options,
  )
}

async function queryAnthropicNative(
  modelType: 'large' | 'small',
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  maxThinkingTokens: number,
  tools: Tool[],
  signal: AbortSignal,
  options?: {
    dangerouslySkipPermissions: boolean
    model: string
    prependCLISysprompt: boolean
  },
): Promise<AssistantMessage> {
  const anthropic = getAnthropicClient(options?.model)
  const config = getGlobalConfig()
  const provider = config.primaryProvider
  const model =
    modelType === 'large' ? config.largeModelName : config.smallModelName

  // Prepend system prompt block for easy API identification
  if (options?.prependCLISysprompt) {
    // Log stats about first block for analyzing prefix matching config
    const [firstSyspromptBlock] = splitSysPromptPrefix(systemPrompt)
    logEvent('tengu_sysprompt_block', {
      snippet: firstSyspromptBlock?.slice(0, 20),
      length: String(firstSyspromptBlock?.length ?? 0),
      hash: firstSyspromptBlock
        ? createHash('sha256').update(firstSyspromptBlock).digest('hex')
        : '',
    })

    systemPrompt = [getCLISyspromptPrefix(), ...systemPrompt]
  }

  const system: TextBlockParam[] = splitSysPromptPrefix(systemPrompt).map(
    _ => ({
      ...(PROMPT_CACHING_ENABLED
        ? { cache_control: { type: 'ephemeral' } }
        : {}),
      text: _,
      type: 'text',
    }),
  )

  const toolSchemas = tools.map(
    tool =>
      ({
        name: tool.name,
        description: tool.description,
        input_schema: zodToJsonSchema(tool.inputSchema),
      }) as Anthropic.Beta.Tools.Tool,
  )

  const anthropicMessages = addCacheBreakpoints(messages)
  const startIncludingRetries = Date.now()

  let start = Date.now()
  let attemptNumber = 0
  let response

  try {
    response = await withRetry(async attempt => {
      attemptNumber = attempt
      start = Date.now()

      const params: Anthropic.Beta.Messages.MessageCreateParams = {
        model,
        max_tokens: getMaxTokensForModelType(modelType),
        messages: anthropicMessages,
        system,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        tool_choice: toolSchemas.length > 0 ? { type: 'auto' } : undefined,
      }

      if (maxThinkingTokens > 0) {
        params.extra_headers = {
          'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
        }
        ;(params as any).thinking = { max_tokens: maxThinkingTokens }
      }

      if (config.stream) {
        const stream = await anthropic.beta.messages.create({
          ...params,
          stream: true,
        })

        let finalResponse: Anthropic.Beta.Messages.Message | null = null
        let messageStartEvent: any = null
        const contentBlocks: any[] = []
        let usage: any = null
        let stopReason: string | null = null
        let stopSequence: string | null = null

        for await (const event of stream) {
          if (event.type === 'message_start') {
            messageStartEvent = event
            finalResponse = {
              ...event.message,
              content: [], // Will be populated from content blocks
            }
          } else if (event.type === 'content_block_start') {
            contentBlocks[event.index] = { ...event.content_block }
          } else if (event.type === 'content_block_delta') {
            if (!contentBlocks[event.index]) {
              contentBlocks[event.index] = {
                type: event.delta.type === 'text_delta' ? 'text' : 'unknown',
                text: '',
              }
            }
            if (event.delta.type === 'text_delta') {
              contentBlocks[event.index].text += event.delta.text
            }
          } else if (event.type === 'message_delta') {
            if (event.delta.stop_reason) stopReason = event.delta.stop_reason
            if (event.delta.stop_sequence)
              stopSequence = event.delta.stop_sequence
            if (event.usage) usage = { ...usage, ...event.usage }
          } else if (event.type === 'message_stop') {
            break
          }
        }

        if (!finalResponse || !messageStartEvent) {
          throw new Error('Stream ended without proper message structure')
        }

        // Construct the final response
        finalResponse = {
          ...messageStartEvent.message,
          content: contentBlocks.filter(Boolean),
          stop_reason: stopReason,
          stop_sequence: stopSequence,
          usage: {
            ...messageStartEvent.message.usage,
            ...usage,
          },
        }

        return finalResponse
      } else {
        return await anthropic.beta.messages.create(params)
      }
    })

    const ttftMs = start - Date.now()
    const durationMs = Date.now() - startIncludingRetries

    const content = response.content.map((block: ContentBlock) => {
      if (block.type === 'text') {
        return {
          type: 'text' as const,
          text: block.text,
        }
      } else if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id,
          name: block.name,
          input: block.input,
        }
      }
      return block
    })

    const assistantMessage: AssistantMessage = {
      message: {
        id: response.id,
        content,
        model: response.model,
        role: 'assistant',
        stop_reason: response.stop_reason,
        stop_sequence: response.stop_sequence,
        type: 'message',
        usage: response.usage,
      },
      type: 'assistant',
      uuid: nanoid() as UUID,
      ttftMs,
      durationMs,
      costUSD: 0, // Will be calculated below
    }

    // Calculate cost using native Anthropic usage data
    const inputTokens = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    const cacheCreationInputTokens =
      response.usage.cache_creation_input_tokens ?? 0
    const cacheReadInputTokens = response.usage.cache_read_input_tokens ?? 0

    const costUSD =
      (inputTokens / 1_000_000) * getModelInputTokenCostUSD(model) +
      (outputTokens / 1_000_000) * getModelOutputTokenCostUSD(model) +
      (cacheCreationInputTokens / 1_000_000) *
        getModelInputTokenCostUSD(model) +
      (cacheReadInputTokens / 1_000_000) *
        (getModelInputTokenCostUSD(model) * 0.1) // Cache reads are 10% of input cost

    assistantMessage.costUSD = costUSD
    addToTotalCost(costUSD)

    logEvent('api_response_anthropic_native', {
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheCreationInputTokens,
      cache_read_input_tokens: cacheReadInputTokens,
      cost_usd: costUSD,
      duration_ms: durationMs,
      ttft_ms: ttftMs,
      attempt_number: attemptNumber,
    })

    return assistantMessage
  } catch (error) {
    return getAssistantMessageFromError(error)
  }
}

function getAssistantMessageFromError(error: unknown): AssistantMessage {
  if (error instanceof Error && error.message.includes('prompt is too long')) {
    return createAssistantAPIErrorMessage(PROMPT_TOO_LONG_ERROR_MESSAGE)
  }
  if (
    error instanceof Error &&
    error.message.includes('Your credit balance is too low')
  ) {
    return createAssistantAPIErrorMessage(CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE)
  }
  if (
    error instanceof Error &&
    error.message.toLowerCase().includes('x-api-key')
  ) {
    return createAssistantAPIErrorMessage(INVALID_API_KEY_ERROR_MESSAGE)
  }
  if (error instanceof Error) {
    if (process.env.NODE_ENV === 'development') {
      console.log(error)
    }
    return createAssistantAPIErrorMessage(
      `${API_ERROR_MESSAGE_PREFIX}: ${error.message}`,
    )
  }
  return createAssistantAPIErrorMessage(API_ERROR_MESSAGE_PREFIX)
}

function addCacheBreakpoints(
  messages: (UserMessage | AssistantMessage)[],
): MessageParam[] {
  return messages.map((msg, index) => {
    return msg.type === 'user'
      ? userMessageToMessageParam(msg, index > messages.length - 3)
      : assistantMessageToMessageParam(msg, index > messages.length - 3)
  })
}

async function queryOpenAI(
  modelType: 'large' | 'small',
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  maxThinkingTokens: number,
  tools: Tool[],
  signal: AbortSignal,
  options?: {
    dangerouslySkipPermissions: boolean
    model: string
    prependCLISysprompt: boolean
  },
): Promise<AssistantMessage> {
  //const anthropic = await getAnthropicClient(options.model)
  const config = getGlobalConfig()
  const model =
    modelType === 'large' ? config.largeModelName : config.smallModelName
  // Prepend system prompt block for easy API identification
  if (options?.prependCLISysprompt) {
    // Log stats about first block for analyzing prefix matching config (see https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_cli_system_prompt_prefixes)
    const [firstSyspromptBlock] = splitSysPromptPrefix(systemPrompt)
    logEvent('tengu_sysprompt_block', {
      snippet: firstSyspromptBlock?.slice(0, 20),
      length: String(firstSyspromptBlock?.length ?? 0),
      hash: firstSyspromptBlock
        ? createHash('sha256').update(firstSyspromptBlock).digest('hex')
        : '',
    })

    systemPrompt = [getCLISyspromptPrefix(), ...systemPrompt]
  }

  const system: TextBlockParam[] = splitSysPromptPrefix(systemPrompt).map(
    _ => ({
      ...(PROMPT_CACHING_ENABLED
        ? { cache_control: { type: 'ephemeral' } }
        : {}),
      text: _,
      type: 'text',
    }),
  )

  const toolSchemas = await Promise.all(
    tools.map(
      async _ =>
        ({
          type: 'function',
          function: {
            name: _.name,
            description: await _.prompt({
              dangerouslySkipPermissions: options?.dangerouslySkipPermissions,
            }),
            // Use tool's JSON schema directly if provided, otherwise convert Zod schema
            parameters:
              'inputJSONSchema' in _ && _.inputJSONSchema
                ? _.inputJSONSchema
                : zodToJsonSchema(_.inputSchema),
          },
        }) as OpenAI.ChatCompletionTool,
    ),
  )

  const openaiSystem = system.map(
    s =>
      ({
        role: 'system',
        content: s.text,
      }) as OpenAI.ChatCompletionMessageParam,
  )

  const openaiMessages = convertAnthropicMessagesToOpenAIMessages(messages)
  const startIncludingRetries = Date.now()

  let start = Date.now()
  let attemptNumber = 0
  let response

  try {
    response = await withRetry(async attempt => {
      attemptNumber = attempt
      start = Date.now()
      const opts: OpenAI.ChatCompletionCreateParams = {
        model,
        max_tokens: getMaxTokensForModelType(modelType),
        messages: [...openaiSystem, ...openaiMessages],
        temperature: MAIN_QUERY_TEMPERATURE,
      }
      if (config.stream) {
        ;(opts as OpenAI.ChatCompletionCreateParams).stream = true
        opts.stream_options = {
          include_usage: true,
        }
      }

      if (toolSchemas.length > 0) {
        opts.tools = toolSchemas
        opts.tool_choice = 'auto'
      }
      const reasoningEffort = await getReasoningEffort(modelType, messages)
      if (reasoningEffort) {
        logEvent('debug_reasoning_effort', {
          effort: reasoningEffort,
        })
        opts.reasoning_effort = reasoningEffort
      }
      const s = await getCompletion(modelType, opts)
      let finalResponse
      if (opts.stream) {
        finalResponse = await handleMessageStream(s as ChatCompletionStream)
      } else {
        finalResponse = s
      }

      const r = convertOpenAIResponseToAnthropic(finalResponse)
      return r
    })
  } catch (error) {
    logError(error)
    return getAssistantMessageFromError(error)
  }
  const durationMs = Date.now() - start
  const durationMsIncludingRetries = Date.now() - startIncludingRetries

  const inputTokens = response.usage?.prompt_tokens ?? 0
  const outputTokens = response.usage?.completion_tokens ?? 0
  const cacheReadInputTokens =
    response.usage?.prompt_token_details?.cached_tokens ?? 0
  const cacheCreationInputTokens =
    response.usage?.prompt_token_details?.cached_tokens ?? 0
  const costUSD =
    (inputTokens / 1_000_000) * SONNET_COST_PER_MILLION_INPUT_TOKENS +
    (outputTokens / 1_000_000) * SONNET_COST_PER_MILLION_OUTPUT_TOKENS +
    (cacheReadInputTokens / 1_000_000) *
      SONNET_COST_PER_MILLION_PROMPT_CACHE_READ_TOKENS +
    (cacheCreationInputTokens / 1_000_000) *
      SONNET_COST_PER_MILLION_PROMPT_CACHE_WRITE_TOKENS

  addToTotalCost(costUSD, durationMsIncludingRetries)

  return {
    message: {
      ...response,
      content: normalizeContentFromAPI(response.content),
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: cacheReadInputTokens,
        cache_creation_input_tokens: 0,
      },
    },
    costUSD,
    durationMs,
    type: 'assistant',
    uuid: randomUUID(),
  }
}

export async function queryHaiku({
  systemPrompt = [],
  userPrompt,
  assistantPrompt,
  enablePromptCaching = false,
  signal,
}: {
  systemPrompt: string[]
  userPrompt: string
  assistantPrompt?: string
  enablePromptCaching?: boolean
  signal?: AbortSignal
}): Promise<AssistantMessage> {
  return await withVCR(
    [
      {
        message: {
          role: 'user',
          content: systemPrompt.map(text => ({ type: 'text', text })),
        },
        type: 'user',
        uuid: randomUUID(),
      },
      {
        message: { role: 'user', content: userPrompt },
        type: 'user',
        uuid: randomUUID(),
      },
    ],
    () => {
      const messages = [
        {
          message: { role: 'user', content: userPrompt },
          type: 'user',
          uuid: randomUUID(),
        },
      ] as (UserMessage | AssistantMessage)[]
      return queryOpenAI('small', messages, systemPrompt, 0, [], signal)
    },
  )
}
function getMaxTokensForModelType(modelType: 'large' | 'small'): number {
  const config = getGlobalConfig()

  let maxTokens

  if (modelType === 'large') {
    maxTokens = config.largeModelMaxTokens
  } else {
    maxTokens = config.smallModelMaxTokens
  }

  if (!maxTokens && config.maxTokens) {
    maxTokens = config.maxTokens
  }

  return maxTokens ?? 8000
}

function getModelInputTokenCostUSD(model: string): number {
  // Find the model in the models object
  for (const providerModels of Object.values(models)) {
    const modelInfo = providerModels.find((m: any) => m.model === model)
    if (modelInfo) {
      return modelInfo.input_cost_per_token || 0
    }
  }
  // Default fallback cost for unknown models
  return 0.000003 // Default to Claude 3 Haiku cost
}

function getModelOutputTokenCostUSD(model: string): number {
  // Find the model in the models object
  for (const providerModels of Object.values(models)) {
    const modelInfo = providerModels.find((m: any) => m.model === model)
    if (modelInfo) {
      return modelInfo.output_cost_per_token || 0
    }
  }
  // Default fallback cost for unknown models
  return 0.000015 // Default to Claude 3 Haiku cost
}
