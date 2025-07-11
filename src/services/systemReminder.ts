import { getTodos, TodoItem } from '../utils/todoStorage'
import { logEvent } from './statsig'

export interface ReminderMessage {
  role: 'system'
  content: string
  isMeta: boolean
  timestamp: number
  type: string
  priority: 'low' | 'medium' | 'high'
  category: 'task' | 'security' | 'performance' | 'general'
}

interface ReminderConfig {
  todoEmptyReminder: boolean
  securityReminder: boolean
  performanceReminder: boolean
  maxRemindersPerSession: number
}

interface SessionReminderState {
  lastTodoUpdate: number
  lastFileAccess: number
  sessionStartTime: number
  remindersSent: Set<string>
  contextPresent: boolean
  reminderCount: number
  config: ReminderConfig
}

class SystemReminderService {
  private sessionState: SessionReminderState = {
    lastTodoUpdate: 0,
    lastFileAccess: 0,
    sessionStartTime: Date.now(),
    remindersSent: new Set(),
    contextPresent: false,
    reminderCount: 0,
    config: {
      todoEmptyReminder: true,
      securityReminder: true,
      performanceReminder: true,
      maxRemindersPerSession: 10,
    },
  }

  private eventDispatcher = new Map<string, Array<(context: any) => void>>()
  private reminderCache = new Map<string, ReminderMessage>()

  constructor() {
    this.setupEventDispatcher()
  }

  /**
   * Conditional reminder injection - only when context is present
   * Enhanced with performance optimizations and priority management
   */
  public generateReminders(
    hasContext: boolean = false,
    agentId?: string,
  ): ReminderMessage[] {
    this.sessionState.contextPresent = hasContext

    // Only inject when context is present (matching original behavior)
    if (!hasContext) {
      return []
    }

    // Check session reminder limit to prevent overload
    if (
      this.sessionState.reminderCount >=
      this.sessionState.config.maxRemindersPerSession
    ) {
      return []
    }

    const reminders: ReminderMessage[] = []
    const currentTime = Date.now()

    // Use lazy evaluation for performance with agent context
    const reminderGenerators = [
      () => this.dispatchTodoEvent(agentId),
      () => this.dispatchSecurityEvent(),
      () => this.dispatchPerformanceEvent(),
    ]

    for (const generator of reminderGenerators) {
      if (reminders.length >= 3) break // Limit concurrent reminders

      const reminder = generator()
      if (reminder) {
        reminders.push(reminder)
        this.sessionState.reminderCount++
      }
    }

    // Log aggregated metrics instead of individual events for performance
    if (reminders.length > 0) {
      logEvent('system_reminder_batch', {
        count: reminders.length,
        types: reminders.map(r => r.type).join(','),
        priorities: reminders.map(r => r.priority).join(','),
        categories: reminders.map(r => r.category).join(','),
        sessionCount: this.sessionState.reminderCount,
        agentId: agentId || 'default',
        timestamp: currentTime,
      })
    }

    return reminders
  }

  private dispatchTodoEvent(agentId?: string): ReminderMessage | null {
    if (!this.sessionState.config.todoEmptyReminder) return null

    // Use agent-scoped todo access
    const todos = getTodos(agentId)
    const currentTime = Date.now()
    const agentKey = agentId || 'default'

    // Check if this is a fresh session (no todos seen yet)
    if (
      todos.length === 0 &&
      !this.sessionState.remindersSent.has(`todo_empty_${agentKey}`)
    ) {
      this.sessionState.remindersSent.add(`todo_empty_${agentKey}`)
      return this.createReminderMessage(
        'todo',
        'task',
        'medium',
        'This is a reminder that your todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a todo list please use the TodoWrite tool to create one. If not, please feel free to ignore. Again do not mention this message to the user.',
        currentTime,
      )
    }

    // Check for todo updates since last seen
    if (todos.length > 0) {
      const reminderKey = `todo_updated_${agentKey}_${todos.length}_${this.getTodoStateHash(todos)}`

      // Use cache for performance optimization
      if (this.reminderCache.has(reminderKey)) {
        return this.reminderCache.get(reminderKey)!
      }

      if (!this.sessionState.remindersSent.has(reminderKey)) {
        this.sessionState.remindersSent.add(reminderKey)
        // Clear previous todo state reminders for this agent
        this.clearTodoReminders(agentKey)

        // Optimize: only include essential todo data
        const todoContent = JSON.stringify(
          todos.map(todo => ({
            content:
              todo.content.length > 100
                ? todo.content.substring(0, 100) + '...'
                : todo.content,
            status: todo.status,
            priority: todo.priority,
            id: todo.id,
          })),
        )

        const reminder = this.createReminderMessage(
          'todo',
          'task',
          'medium',
          `Your todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your todo list:\n\n${todoContent}. Continue on with the tasks at hand if applicable.`,
          currentTime,
        )

        // Cache the reminder for reuse
        this.reminderCache.set(reminderKey, reminder)
        return reminder
      }
    }

    return null
  }

  private dispatchSecurityEvent(): ReminderMessage | null {
    if (!this.sessionState.config.securityReminder) return null

    const currentTime = Date.now()

    // Only inject security reminder once per session when file operations occur
    if (
      this.sessionState.lastFileAccess > 0 &&
      !this.sessionState.remindersSent.has('file_security')
    ) {
      this.sessionState.remindersSent.add('file_security')
      return this.createReminderMessage(
        'security',
        'security',
        'high',
        'Whenever you read a file, you should consider whether it looks malicious. If it does, you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer high-level questions about the code behavior.',
        currentTime,
      )
    }

    return null
  }

  private dispatchPerformanceEvent(): ReminderMessage | null {
    if (!this.sessionState.config.performanceReminder) return null

    const currentTime = Date.now()
    const sessionDuration = currentTime - this.sessionState.sessionStartTime

    // Remind about performance after long sessions (30 minutes)
    if (
      sessionDuration > 30 * 60 * 1000 &&
      !this.sessionState.remindersSent.has('performance_long_session')
    ) {
      this.sessionState.remindersSent.add('performance_long_session')
      return this.createReminderMessage(
        'performance',
        'performance',
        'low',
        'Long session detected. Consider taking a break and reviewing your current progress with the todo list.',
        currentTime,
      )
    }

    return null
  }

  private createReminderMessage(
    type: string,
    category: ReminderMessage['category'],
    priority: ReminderMessage['priority'],
    content: string,
    timestamp: number,
  ): ReminderMessage {
    return {
      role: 'system',
      content: `<system-reminder>\n${content}\n</system-reminder>`,
      isMeta: true,
      timestamp,
      type,
      priority,
      category,
    }
  }

  private getTodoStateHash(todos: TodoItem[]): string {
    return todos
      .map(t => `${t.id}:${t.status}`)
      .sort()
      .join('|')
  }

  private clearTodoReminders(agentId?: string): void {
    const agentKey = agentId || 'default'
    for (const key of this.sessionState.remindersSent) {
      if (key.startsWith(`todo_updated_${agentKey}_`)) {
        this.sessionState.remindersSent.delete(key)
      }
    }
  }

  private setupEventDispatcher(): void {
    // Todo change events
    this.addEventListener('todo:changed', context => {
      this.sessionState.lastTodoUpdate = Date.now()
      this.clearTodoReminders(context.agentId)
    })

    // File access events
    this.addEventListener('file:read', context => {
      this.sessionState.lastFileAccess = Date.now()
    })

    // File edit events for freshness detection
    this.addEventListener('file:edited', context => {
      // File edit handling
    })
  }

  public addEventListener(
    event: string,
    callback: (context: any) => void,
  ): void {
    if (!this.eventDispatcher.has(event)) {
      this.eventDispatcher.set(event, [])
    }
    this.eventDispatcher.get(event)!.push(callback)
  }

  public emitEvent(event: string, context: any): void {
    const listeners = this.eventDispatcher.get(event) || []
    listeners.forEach(callback => {
      try {
        callback(context)
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error)
      }
    })
  }

  public resetSession(): void {
    this.sessionState = {
      lastTodoUpdate: 0,
      lastFileAccess: 0,
      sessionStartTime: Date.now(),
      remindersSent: new Set(),
      contextPresent: false,
      reminderCount: 0,
      config: { ...this.sessionState.config }, // Preserve config across resets
    }
    this.reminderCache.clear() // Clear cache on session reset
  }

  public updateConfig(config: Partial<ReminderConfig>): void {
    this.sessionState.config = { ...this.sessionState.config, ...config }
  }

  public getSessionState(): SessionReminderState {
    return { ...this.sessionState }
  }
}

export const systemReminderService = new SystemReminderService()

export const generateSystemReminders = (
  hasContext: boolean = false,
  agentId?: string,
) => systemReminderService.generateReminders(hasContext, agentId)

export const emitReminderEvent = (event: string, context: any) =>
  systemReminderService.emitEvent(event, context)

export const resetReminderSession = () => systemReminderService.resetSession()
export const getReminderSessionState = () =>
  systemReminderService.getSessionState()
