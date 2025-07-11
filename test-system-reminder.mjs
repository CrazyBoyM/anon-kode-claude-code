#!/usr/bin/env node

// Test script to verify system reminder functionality
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Mock path
const srcPath = join(__dirname, 'src')

// Import the system reminder service
import(`${srcPath}/services/systemReminder.ts`).then(async ({ 
  systemReminderService, 
  generateSystemReminders, 
  emitReminderEvent,
  resetReminderSession,
  getReminderSessionState 
}) => {
  console.log('🔧 Testing System Reminder Mechanism...\n')

  // Test 1: Reset and check initial state
  console.log('Test 1: Initial state after reset')
  resetReminderSession()
  const initialState = getReminderSessionState()
  console.log('Initial state:', {
    remindersSent: initialState.remindersSent.size,
    reminderCount: initialState.reminderCount,
    contextPresent: initialState.contextPresent
  })

  // Test 2: Generate reminders without context (should return empty)
  console.log('\nTest 2: Generate reminders without context')
  const noContextReminders = generateSystemReminders(false)
  console.log('Reminders without context:', noContextReminders.length)

  // Test 3: Generate reminders with context (should return reminders)
  console.log('\nTest 3: Generate reminders with context')
  const withContextReminders = generateSystemReminders(true)
  console.log('Reminders with context:', withContextReminders.length)
  withContextReminders.forEach((reminder, idx) => {
    console.log(`  ${idx + 1}. Type: ${reminder.type}, Priority: ${reminder.priority}`)
    console.log(`     Category: ${reminder.category}`)
    console.log(`     Content preview: ${reminder.content.substring(0, 100)}...`)
  })

  // Test 4: Emit todo change event and generate reminders again
  console.log('\nTest 4: Emit todo change event')
  emitReminderEvent('todo:changed', {
    previousTodos: [],
    newTodos: [{ id: '1', content: 'Test todo', status: 'pending', priority: 'medium' }],
    timestamp: Date.now(),
    agentId: 'test-agent',
    changeType: 'added'
  })

  const afterTodoReminders = generateSystemReminders(true, 'test-agent')
  console.log('Reminders after todo change:', afterTodoReminders.length)

  // Test 5: Emit file read event
  console.log('\nTest 5: Emit file read event')
  emitReminderEvent('file:read', {
    filePath: '/test/file.txt',
    extension: '.txt',
    timestamp: Date.now()
  })

  const afterFileReadReminders = generateSystemReminders(true)
  console.log('Reminders after file read:', afterFileReadReminders.length)
  afterFileReadReminders.forEach((reminder, idx) => {
    console.log(`  ${idx + 1}. Type: ${reminder.type}`)
  })

  // Test 6: Check session state
  console.log('\nTest 6: Final session state')
  const finalState = getReminderSessionState()
  console.log('Final state:', {
    remindersSent: Array.from(finalState.remindersSent),
    reminderCount: finalState.reminderCount,
    lastTodoUpdate: finalState.lastTodoUpdate,
    lastFileAccess: finalState.lastFileAccess
  })

  console.log('\n✅ System reminder tests completed!')

}).catch(error => {
  console.error('❌ Test failed:', error)
  
  // If import fails, let's check if the files exist
  import('fs').then(fs => {
    const systemReminderPath = join(srcPath, 'services', 'systemReminder.ts')
    console.log('systemReminder.ts exists:', fs.existsSync(systemReminderPath))
    
    const todoStoragePath = join(srcPath, 'utils', 'todoStorage.ts')
    console.log('todoStorage.ts exists:', fs.existsSync(todoStoragePath))
  })
})