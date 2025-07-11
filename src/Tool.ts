import { z } from 'zod'
import { UUID } from 'crypto'
import * as React from 'react'

export interface ToolUseContext {
  messageId: UUID
  agentId?: string
  dangerouslySkipPermissions?: boolean
}

export interface ValidationResult {
  result: boolean
  message?: string
  errorCode?: number
  meta?: any
}

export interface Tool<
  TInput extends z.ZodObject<any> = z.ZodObject<any>,
  TOutput = any,
> {
  name: string
  description?: () => Promise<string>
  inputSchema: TInput
  inputJSONSchema?: Record<string, unknown>
  prompt: (options?: {
    dangerouslySkipPermissions?: boolean
  }) => Promise<string>
  userFacingName?: () => string
  isEnabled: () => Promise<boolean>
  isReadOnly: () => boolean
  isConcurrencySafe: () => boolean
  needsPermissions: (input?: z.infer<TInput>) => boolean
  validateInput?: (
    input: z.infer<TInput>,
    context?: ToolUseContext,
  ) => Promise<ValidationResult>
  renderResultForAssistant: (output: TOutput) => string
  renderToolUseMessage: (
    input: z.infer<TInput>,
    options: { verbose: boolean },
  ) => string
  renderToolUseRejectedMessage: () => React.ReactElement
  renderToolResultMessage?: (output: TOutput) => React.ReactElement
  call: (
    input: z.infer<TInput>,
    context: ToolUseContext,
  ) => AsyncGenerator<
    { type: 'result'; data: TOutput; resultForAssistant?: string },
    void,
    unknown
  >
}

export type { ToolUseContext, ValidationResult }
