import { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import chalk from 'chalk'
import { last, memoize } from 'lodash-es'
import { EOL } from 'os'
import * as React from 'react'
import { Box, Text } from 'ink'
import { z } from 'zod'
import { Tool } from '../../Tool'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { getAgentPrompt } from '../../constants/prompts'
import { getContext } from '../../context'
import { hasPermissionsToUseTool } from '../../permissions'
import { AssistantMessage, Message as MessageType, query } from '../../query'
import { formatDuration, formatNumber } from '../../utils/format'
import {
  getMessagesPath,
  getNextAvailableLogSidechainNumber,
  overwriteLog,
} from '../../utils/log.js'
import { applyMarkdown } from '../../utils/markdown'
import {
  createAssistantMessage,
  createUserMessage,
  getLastAssistantMessageId,
  INTERRUPT_MESSAGE,
  normalizeMessages,
} from '../../utils/messages.js'
import { getSlowAndCapableModel } from '../../utils/model'
import { getMaxThinkingTokens } from '../../utils/thinking'
import { getTheme } from '../../utils/theme'
import { generateAgentId } from '../../utils/agentStorage'
import { getAgentTools, getPrompt } from './prompt'
import { TOOL_NAME } from './constants'

const inputSchema = z.object({
  description: z
    .string()
    .describe('A short (3-5 word) description of the task'),
  prompt: z.string().describe('The task for the agent to perform'),
})

export const AgentTool = {
  async prompt({ dangerouslySkipPermissions }) {
    return await getPrompt(dangerouslySkipPermissions)
  },
  name: TOOL_NAME,
  async description() {
    return 'Launch a new agent for intelligent search and analysis tasks'
  },
  inputSchema,
  async *call(
    { description, prompt },
    {
      abortController,
      options: {
        dangerouslySkipPermissions = false,
        forkNumber,
        messageLogName,
        verbose,
      },
      readFileTimestamps,
    },
  ) {
    const startTime = Date.now()
    const messages: MessageType[] = [createUserMessage(prompt)]
    const tools = await getAgentTools(dangerouslySkipPermissions)

    // We yield an initial message immediately so the UI
    // doesn't move around when messages start streaming back.
    yield {
      type: 'progress',
      content: createAssistantMessage(chalk.dim('Initializing…')),
      normalizedMessages: normalizeMessages(messages),
      tools,
    }

    const [agentPrompt, context, slowAndCapableModel, maxThinkingTokens] =
      await Promise.all([
        getAgentPrompt(),
        getContext(),
        getSlowAndCapableModel(),
        getMaxThinkingTokens(messages),
      ])
    let toolUseCount = 0

    const getSidechainNumber = memoize(() =>
      getNextAvailableLogSidechainNumber(messageLogName, forkNumber),
    )

    // Generate unique Agent ID for this agent execution
    const agentId = generateAgentId()

    for await (const message of query(
      messages,
      agentPrompt,
      context,
      hasPermissionsToUseTool,
      {
        abortController,
        options: {
          dangerouslySkipPermissions,
          forkNumber,
          messageLogName,
          tools,
          commands: [],
          verbose,
          slowAndCapableModel,
          maxThinkingTokens,
        },
        messageId: getLastAssistantMessageId(messages),
        agentId, // Pass the generated Agent ID
        readFileTimestamps,
      },
    )) {
      messages.push(message)

      overwriteLog(
        // IMPORTANT: Compute sidechain number here, not earlier, to avoid a race condition
        // where concurrent Agents reserve the same sidechain number.
        getMessagesPath(messageLogName, forkNumber, getSidechainNumber()),
        messages.filter(_ => _.type !== 'progress'),
      )

      if (message.type !== 'assistant') {
        continue
      }

      const normalizedMessages = normalizeMessages(messages)
      for (const content of message.message.content) {
        if (content.type !== 'tool_use') {
          continue
        }

        toolUseCount++
        yield {
          type: 'progress',
          content: normalizedMessages.find(
            _ =>
              _.type === 'assistant' &&
              _.message.content[0]?.type === 'tool_use' &&
              _.message.content[0].id === content.id,
          ) as AssistantMessage,
          normalizedMessages,
          tools,
        }
      }
    }

    const normalizedMessages = normalizeMessages(messages)
    const lastMessage = last(messages)
    if (lastMessage?.type !== 'assistant') {
      throw new Error('Last message was not an assistant message')
    }

    if (
      lastMessage.message.content.some(
        _ => _.type === 'text' && _.text === INTERRUPT_MESSAGE,
      )
    ) {
      yield {
        type: 'progress',
        content: lastMessage,
        normalizedMessages,
        tools,
      }
    } else {
      const result = [
        toolUseCount === 1 ? '1 tool use' : `${toolUseCount} tool uses`,
        formatNumber(
          (lastMessage.message.usage.cache_creation_input_tokens ?? 0) +
            (lastMessage.message.usage.cache_read_input_tokens ?? 0) +
            lastMessage.message.usage.input_tokens +
            lastMessage.message.usage.output_tokens,
        ) + ' tokens',
        formatDuration(Date.now() - startTime),
      ]
      yield {
        type: 'progress',
        content: createAssistantMessage(`Done (${result.join(' · ')})`),
        normalizedMessages,
        tools,
      }
    }

    // Output is an AssistantMessage, but since AgentTool is a tool, it needs
    // to serialize its response to UserMessage-compatible content.
    const data = lastMessage.message.content.filter(_ => _.type === 'text')
    yield {
      type: 'result',
      data,
      normalizedMessages,
      resultForAssistant: this.renderResultForAssistant(data),
      tools,
    }
  },
  isReadOnly() {
    return true // for now...
  },
  isConcurrencySafe() {
    return true // Task tool supports concurrent execution in official implementation
  },
  async validateInput(input, context) {
    if (!input.description || typeof input.description !== 'string') {
      return {
        result: false,
        message: 'Description is required and must be a string',
      }
    }
    if (!input.prompt || typeof input.prompt !== 'string') {
      return {
        result: false,
        message: 'Prompt is required and must be a string',
      }
    }
    return { result: true }
  },
  async isEnabled() {
    return true
  },
  userFacingName() {
    return 'Task'
  },
  needsPermissions() {
    return false
  },
  renderResultForAssistant(data) {
    return data
  },
  renderToolUseMessage({ description, prompt }, { verbose }) {
    if (!description || !prompt) return null
    if (verbose) {
      const theme = getTheme()
      return (
        <>
          <Text bold color="yellow">
            ############### Task Prompt Start ###############
          </Text>
          <Text>{'\n\n'}</Text>
          <Text bold color={theme.text}>
            {applyMarkdown(prompt)}
          </Text>
          <Text>{'\n\n'}</Text>
          <Text bold color="yellow">
            ############### Task Prompt End ###############
          </Text>
        </>
      )
    }
    return description
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
} satisfies Tool<typeof inputSchema, TextBlock[]>
