import { createToolExecutionController } from '../src/utils/toolExecutionController'
import { getAllTools } from '../src/tools'

// Test tool execution control
const tools = getAllTools()
const controller = createToolExecutionController(tools)

// Mock tool use messages
const mockToolUses = [
  { id: '1', name: 'View', type: 'tool_use', input: {} },      // Read-only: concurrent
  { id: '2', name: 'Glob', type: 'tool_use', input: {} },     // Read-only: concurrent  
  { id: '3', name: 'Edit', type: 'tool_use', input: {} },     // Write: sequential
  { id: '4', name: 'TodoRead', type: 'tool_use', input: {} }, // Read-only: concurrent
  { id: '5', name: 'Bash', type: 'tool_use', input: {} },     // Write: sequential
]

console.log('=== Tool Execution Control Test ===')
console.log('Available tools:', tools.map(t => `${t.name} (safe: ${t.isConcurrencySafe()})`).join(', '))
console.log()

console.log('Individual tool analysis:')
mockToolUses.forEach(toolUse => {
  const info = controller.getToolConcurrencyInfo(toolUse.name)
  console.log(`- ${toolUse.name}: ${info.found ? `safe=${info.isConcurrencySafe}, readonly=${info.isReadOnly}` : 'NOT_FOUND'}`)
})
console.log()

console.log('Execution plan analysis:')
const plan = controller.analyzeExecutionPlan(mockToolUses)
console.log(`- Can optimize: ${plan.canOptimize}`)
console.log(`- Concurrent tools: ${plan.concurrentCount}`)
console.log(`- Sequential tools: ${plan.sequentialCount}`)
console.log(`- Execution groups: ${plan.groups.length}`)
console.log('- Recommendations:')
plan.recommendations.forEach(rec => console.log(`  * ${rec}`))
console.log()

console.log('Tool groups:')
plan.groups.forEach((group, index) => {
  console.log(`Group ${index + 1}:`)
  if (group.concurrent.length > 0) {
    console.log(`  Concurrent: ${group.concurrent.map(t => t.name).join(', ')}`)
  }
  if (group.sequential.length > 0) {
    console.log(`  Sequential: ${group.sequential.map(t => t.name).join(', ')}`)
  }
})

console.log('\n=== Test Completed ===')