#!/usr/bin/env node

import { systemReminderService, generateSystemReminders, emitReminderEvent } from './src/services/systemReminder.ts'

console.log('Testing System Reminder Mechanism...\n')

// Test 1: Initial state
console.log('=== Test 1: Initial State ===')
console.log('Initial session state:', systemReminderService.getSessionState())

// Test 2: Generate reminders without context (should return empty)
console.log('\n=== Test 2: Generate reminders without context ===')
const remindersWithoutContext = generateSystemReminders(false)
console.log('Reminders without context:', remindersWithoutContext)
console.log('Expected: empty array (should be [])')

// Test 3: Generate reminders with context but no todos (should trigger empty todo reminder)
console.log('\n=== Test 3: Generate reminders with context (no todos) ===')
const remindersWithContext = generateSystemReminders(true)
console.log('Reminders with context (no todos):')
remindersWithContext.forEach((reminder, i) => {
  console.log(`  Reminder ${i + 1}:`)
  console.log(`    Type: ${reminder.type}`)
  console.log(`    Category: ${reminder.category}`)
  console.log(`    Priority: ${reminder.priority}`)
  console.log(`    Content length: ${reminder.content.length}`)
  console.log(`    Content preview: ${reminder.content.substring(0, 100)}...`)
})

// Test 4: Emit file read event
console.log('\n=== Test 4: Emit file read event ===')
emitReminderEvent('file:read', {
  filePath: '/test/file.js',
  extension: '.js',
  timestamp: Date.now()
})
console.log('File read event emitted')

// Test 5: Generate reminders after file read (should trigger security reminder)
console.log('\n=== Test 5: Generate reminders after file read ===')
const remindersAfterFileRead = generateSystemReminders(true)
console.log('Reminders after file read:')
remindersAfterFileRead.forEach((reminder, i) => {
  console.log(`  Reminder ${i + 1}:`)
  console.log(`    Type: ${reminder.type}`)
  console.log(`    Category: ${reminder.category}`)
  console.log(`    Priority: ${reminder.priority}`)
  console.log(`    Content length: ${reminder.content.length}`)
  console.log(`    Content preview: ${reminder.content.substring(0, 100)}...`)
})

// Test 6: Session state after events
console.log('\n=== Test 6: Session state after events ===')
console.log('Session state after events:', systemReminderService.getSessionState())

// Test 7: Test todo change event
console.log('\n=== Test 7: Test todo change event ===')
emitReminderEvent('todo:changed', {
  previousTodos: [],
  newTodos: [{
    id: 'test-1',
    content: 'Test todo item',
    status: 'pending',
    priority: 'medium'
  }],
  timestamp: Date.now(),
  agentId: 'test-agent',
  changeType: 'added'
})
console.log('Todo change event emitted')

// Test 8: Generate reminders after todo change
console.log('\n=== Test 8: Generate reminders after todo change ===')
const remindersAfterTodoChange = generateSystemReminders(true, 'test-agent')
console.log('Reminders after todo change:')
remindersAfterTodoChange.forEach((reminder, i) => {
  console.log(`  Reminder ${i + 1}:`)
  console.log(`    Type: ${reminder.type}`)
  console.log(`    Category: ${reminder.category}`)
  console.log(`    Priority: ${reminder.priority}`)
  console.log(`    Content length: ${reminder.content.length}`)
  console.log(`    Content preview: ${reminder.content.substring(0, 100)}...`)
})

console.log('\n=== Test Complete ===')