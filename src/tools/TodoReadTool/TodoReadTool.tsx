import { Box, Text } from 'ink'
import * as React from 'react'
import { z } from 'zod'
import { FallbackToolUseRejectedMessage } from '../../components/FallbackToolUseRejectedMessage'
import { TodoItem as TodoItemComponent } from '../../components/TodoItem'
import { Tool } from '../../Tool'
import {
  getTodos,
  getTodosByStatus,
  getTodosByPriority,
  getTodoById,
  TodoItem,
} from '../../utils/todoStorage'
import { DESCRIPTION, PROMPT } from './prompt'
import { getTheme } from '../../utils/theme'

// Simplified input schema matching official implementation
const inputSchema = z
  .strictObject({
    // No input required, matching official TodoRead
  })
  .describe('No input is required, leave this field blank')

function formatTodos(
  todos: TodoItem[],
  showSummary = false,
  verbose = false,
): string {
  if (todos.length === 0) {
    return 'No todos found.'
  }

  if (showSummary) {
    const summary = todos.reduce(
      (acc, todo) => {
        acc[todo.status] = (acc[todo.status] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    return `Todo Summary:
- Pending: ${summary.pending || 0}
- In Progress: ${summary.in_progress || 0}  
- Completed: ${summary.completed || 0}
- Total: ${todos.length}`
  }

  // Use official checkbox characters
  return todos
    .map(todo => {
      const checkbox = todo.status === 'completed' ? '☒' : '☐'

      if (verbose) {
        const priorityDisplay =
          todo.priority === 'high'
            ? '(P0)'
            : todo.priority === 'medium'
              ? '(P1)'
              : '(P2)'
        return `${checkbox} [${todo.id}] ${todo.content} ${priorityDisplay}`
      } else {
        return `${checkbox} ${todo.content}`
      }
    })
    .join('\n')
}

export const TodoReadTool = {
  name: 'TodoRead',
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return 'Read Todos'
  },
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true // TodoRead is read-only, safe for concurrent execution
  },
  needsPermissions() {
    return false
  },
  renderResultForAssistant(content) {
    return typeof content === 'string' ? content : content.content || content
  },
  renderToolUseMessage(input, { verbose }) {
    // Return empty string to match reference implementation and avoid unnecessary output
    return ''
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output, { verbose }) {
    const isError = typeof output === 'string' && output.startsWith('Error')

    // If output contains todo data, render simple checkbox list like TodoWriteTool
    if (typeof output === 'object' && output && 'todos' in output) {
      const { todos = [] } = output as any

      // If no todos, show empty state message
      if (todos.length === 0) {
        return (
          <Box justifyContent="space-between" overflowX="hidden" width="100%">
            <Box flexDirection="row">
              <Text color={getTheme().secondaryText}>
                &nbsp;&nbsp;⎿ &nbsp;No todos found
              </Text>
            </Box>
          </Box>
        )
      }

      // sort: [completed, in_progress, pending]
      const sortedTodos = [...todos].sort((a, b) => {
        const order = ['completed', 'in_progress', 'pending']
        return (
          order.indexOf(a.status) - order.indexOf(b.status) ||
          a.content.localeCompare(b.content)
        )
      })

      // Render each todo item with proper styling matching TodoWriteTool
      return (
        <Box justifyContent="space-between" overflowX="hidden" width="100%">
          <Box flexDirection="row">
            <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
            <Box flexDirection="column">
              {sortedTodos.map((todo: TodoItem, index: number) => {
                const status_icon_map = {
                  completed: '🟢',
                  in_progress: '🟢',
                  pending: '🟡',
                }
                const checkbox = status_icon_map[todo.status]

                const status_color_map = {
                  completed: '#008000',
                  in_progress: '#008000',
                  pending: '#FFD700',
                }
                const text_color = status_color_map[todo.status]

                return (
                  <Text
                    key={todo.id || index}
                    color={text_color}
                    bold={todo.status !== 'pending'}
                    strikethrough={todo.status === 'completed'}
                  >
                    {checkbox} {todo.content}
                  </Text>
                )
              })}
            </Box>
          </Box>
        </Box>
      )
    }

    // Fallback to simple text rendering for errors or string output
    return (
      <Box justifyContent="space-between" overflowX="hidden" width="100%">
        <Box flexDirection="row">
          <Text color={isError ? getTheme().error : getTheme().success}>
            &nbsp;&nbsp;⎿ &nbsp;
            {typeof output === 'string' ? output : JSON.stringify(output)}
          </Text>
        </Box>
      </Box>
    )
  },

  async validateInput(input) {
    // No validation needed for empty input schema
    return { result: true }
  },
  async *call(input, context) {
    // Get agent ID from context for agent-scoped todo reading
    const agentId = context?.agentId
    const todos = getTodos(agentId)
    const verbose = context?.options?.verbose ?? false
    const content = formatTodos(todos, false, verbose)

    try {
      yield {
        type: 'result',
        data: { todos, content }, // Return structured data with both todos and formatted content
        resultForAssistant: content,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred'
      const errorContent = `Error reading todos: ${errorMessage}`

      yield {
        type: 'result',
        data: errorContent,
        resultForAssistant: errorContent,
      }
    }
  },
} satisfies Tool<
  typeof inputSchema,
  { todos: TodoItem[]; content: string } | string
>
