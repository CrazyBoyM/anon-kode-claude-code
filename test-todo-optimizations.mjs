#!/usr/bin/env node

// 简单的todo系统优化测试脚本
import { TodoWriteTool } from './src/tools/TodoWriteTool/TodoWriteTool.tsx'
import { TodoReadTool } from './src/tools/TodoReadTool/TodoReadTool.tsx'
import { setTodos, getTodos, getTodoStatistics, optimizeTodoStorage } from './src/utils/todoStorage.ts'

console.log('🧪 Testing Todo System Optimizations\n')

// 测试数据
const testTodos = [
  { id: 'task-1', content: '实现用户认证功能', status: 'in_progress', priority: 'high' },
  { id: 'task-2', content: '优化数据库查询性能', status: 'pending', priority: 'medium' },
  { id: 'task-3', content: '编写单元测试', status: 'completed', priority: 'low' }
]

async function testTodoWriteTool() {
  console.log('📝 Testing TodoWriteTool...')
  
  try {
    // 测试输入验证
    const validation = await TodoWriteTool.validateInput({ todos: testTodos })
    console.log('✅ Input validation:', validation.result ? 'PASSED' : 'FAILED')
    
    // 测试工具调用
    const generator = TodoWriteTool.call({ todos: testTodos })
    const result = await generator.next()
    console.log('✅ Tool execution:', result.done === false ? 'PASSED' : 'FAILED')
    console.log('📊 Result:', result.value?.data?.substring(0, 100) + '...')
    
  } catch (error) {
    console.log('❌ TodoWriteTool test failed:', error.message)
  }
}

async function testTodoReadTool() {
  console.log('\n📖 Testing TodoReadTool...')
  
  try {
    // 测试不同过滤模式
    const tests = [
      { filter_type: 'all' },
      { filter_type: 'status', filter_value: 'pending' },
      { filter_type: 'priority', filter_value: 'high' },
      { filter_type: 'summary' }
    ]
    
    for (const test of tests) {
      const generator = TodoReadTool.call(test, { options: { verbose: false } })
      const result = await generator.next()
      console.log(`✅ Filter ${test.filter_type}:`, result.done === false ? 'PASSED' : 'FAILED')
    }
    
  } catch (error) {
    console.log('❌ TodoReadTool test failed:', error.message)
  }
}

async function testPerformanceOptimizations() {
  console.log('\n⚡ Testing Performance Optimizations...')
  
  try {
    // 测试统计功能
    const stats = getTodoStatistics()
    console.log('✅ Statistics generation: PASSED')
    console.log('📈 Cache efficiency:', stats.cacheEfficiency + '%')
    console.log('📊 Total operations:', stats.metrics.totalOperations)
    
    // 测试存储优化
    optimizeTodoStorage()
    console.log('✅ Storage optimization: PASSED')
    
    // 测试缓存性能
    const start = Date.now()
    for (let i = 0; i < 1000; i++) {
      getTodos() // 应该大部分时间命中缓存
    }
    const end = Date.now()
    console.log(`✅ Cache performance: ${end - start}ms for 1000 reads`)
    
  } catch (error) {
    console.log('❌ Performance test failed:', error.message)
  }
}

async function testErrorHandling() {
  console.log('\n🛡️ Testing Error Handling...')
  
  try {
    // 测试重复ID检测
    const duplicateIdTodos = [
      { id: 'duplicate', content: 'Task 1', status: 'pending', priority: 'high' },
      { id: 'duplicate', content: 'Task 2', status: 'pending', priority: 'low' }
    ]
    
    const validation = await TodoWriteTool.validateInput({ todos: duplicateIdTodos })
    console.log('✅ Duplicate ID detection:', !validation.result ? 'PASSED' : 'FAILED')
    
    // 测试多个进行中任务检测
    const multipleInProgressTodos = [
      { id: 'task-a', content: 'Task A', status: 'in_progress', priority: 'high' },
      { id: 'task-b', content: 'Task B', status: 'in_progress', priority: 'low' }
    ]
    
    const validation2 = await TodoWriteTool.validateInput({ todos: multipleInProgressTodos })
    console.log('✅ Multiple in-progress detection:', !validation2.result ? 'PASSED' : 'FAILED')
    
  } catch (error) {
    console.log('❌ Error handling test failed:', error.message)
  }
}

async function runTests() {
  console.log('🚀 Starting Todo System Optimization Tests...\n')
  
  await testTodoWriteTool()
  await testTodoReadTool()
  await testPerformanceOptimizations()
  await testErrorHandling()
  
  console.log('\n🎉 All tests completed!')
  console.log('\n📋 Final Statistics:')
  const finalStats = getTodoStatistics()
  console.log(JSON.stringify(finalStats, null, 2))
}

runTests().catch(console.error)