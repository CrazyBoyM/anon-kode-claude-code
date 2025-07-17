# 测试和验证策略

## 测试金字塔

### 1. 单元测试 (Unit Tests)

#### 状态机测试
```tsx
// __tests__/hooks/useRequestState.test.ts
import { renderHook, act } from '@testing-library/react'
import { useRequestState } from '../../hooks/useRequestState'

describe('useRequestState', () => {
  it('should start in idle state', () => {
    const { result } = renderHook(() => useRequestState())
    expect(result.current.state.status).toBe('idle')
  })
  
  it('should transition from idle to loading', () => {
    const { result } = renderHook(() => useRequestState())
    
    act(() => {
      result.current.dispatch({ 
        type: 'START_REQUEST', 
        requestId: 'test-123' 
      })
    })
    
    expect(result.current.state.status).toBe('loading')
    expect(result.current.state.requestId).toBe('test-123')
    expect(result.current.state.abortController).toBeInstanceOf(AbortController)
  })
  
  it('should not allow starting request from non-idle state', () => {
    const { result } = renderHook(() => useRequestState())
    
    // 先开始一个请求
    act(() => {
      result.current.dispatch({ 
        type: 'START_REQUEST', 
        requestId: 'test-1' 
      })
    })
    
    // 尝试开始另一个请求
    act(() => {
      result.current.dispatch({ 
        type: 'START_REQUEST', 
        requestId: 'test-2' 
      })
    })
    
    // 应该仍然是第一个请求
    expect(result.current.state.requestId).toBe('test-1')
  })
  
  it('should handle cancellation from any active state', () => {
    const { result } = renderHook(() => useRequestState())
    
    // 开始请求
    act(() => {
      result.current.dispatch({ 
        type: 'START_REQUEST', 
        requestId: 'test-123' 
      })
    })
    
    // 请求权限
    act(() => {
      result.current.dispatch({ 
        type: 'REQUEST_TOOL_PERMISSION', 
        permission: mockPermission 
      })
    })
    
    // 取消请求
    act(() => {
      result.current.dispatch({ 
        type: 'CANCEL_REQUEST', 
        reason: 'user_cancel' 
      })
    })
    
    expect(result.current.state.status).toBe('cancelled')
    expect(result.current.state.reason).toBe('user_cancel')
  })
  
  it('should auto-reset to idle after cancellation', async () => {
    const { result } = renderHook(() => useRequestState())
    
    act(() => {
      result.current.dispatch({ 
        type: 'START_REQUEST', 
        requestId: 'test-123' 
      })
    })
    
    act(() => {
      result.current.dispatch({ 
        type: 'CANCEL_REQUEST' 
      })
    })
    
    // 等待自动重置
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150))
    })
    
    expect(result.current.state.status).toBe('idle')
  })
})
```

#### 组件渲染测试
```tsx
// __tests__/components/REPL.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { REPL } from '../../screens/REPL'

const mockProps = {
  commands: [],
  tools: [],
  messageLogName: 'test',
  shouldShowPromptInput: true,
  // ... 其他必需的 props
}

describe('REPL Component', () => {
  it('should render input in idle state', () => {
    render(<REPL {...mockProps} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })
  
  it('should show spinner when loading', async () => {
    render(<REPL {...mockProps} />)
    
    // 模拟开始请求
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'test message' } })
    fireEvent.keyPress(input, { key: 'Enter', code: 13, charCode: 13 })
    
    expect(screen.getByText(/processing/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
  
  it('should not render multiple input boxes simultaneously', () => {
    render(<REPL {...mockProps} />)
    
    const inputs = screen.queryAllByRole('textbox')
    expect(inputs).toHaveLength(1)
  })
  
  it('should handle cancellation properly', async () => {
    render(<REPL {...mockProps} />)
    
    // 开始请求
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'test message' } })
    fireEvent.keyPress(input, { key: 'Enter', code: 13, charCode: 13 })
    
    expect(screen.getByText(/processing/i)).toBeInTheDocument()
    
    // 按 ESC 取消
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    
    // 应该显示中断消息
    expect(screen.getByText(/interrupted/i)).toBeInTheDocument()
    
    // 等待回到 idle 状态
    await screen.findByRole('textbox')
  })
})
```

### 2. 集成测试 (Integration Tests)

#### 完整请求生命周期测试
```tsx
// __tests__/integration/requestLifecycle.test.tsx
describe('Request Lifecycle Integration', () => {
  it('should handle complete request flow', async () => {
    const mockQuery = jest.fn().mockResolvedValue({ message: 'response' })
    
    render(<REPL {...mockProps} onQuery={mockQuery} />)
    
    // 1. 开始请求
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'test prompt' } })
    fireEvent.submit(input)
    
    // 2. 验证 loading 状态
    expect(screen.getByText(/processing/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    
    // 3. 等待请求完成
    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ content: 'test prompt' })
        ])
      )
    })
    
    // 4. 验证回到 idle 状态
    await screen.findByRole('textbox')
    expect(screen.queryByText(/processing/i)).not.toBeInTheDocument()
  })
  
  it('should handle tool permission flow', async () => {
    const mockTool = {
      name: 'test-tool',
      needsPermissions: () => true,
      // ...
    }
    
    const { container } = render(<REPL {...mockProps} tools={[mockTool]} />)
    
    // 触发需要权限的工具
    // ... 模拟工具调用
    
    // 验证权限对话框出现
    expect(screen.getByText(/grant permission/i)).toBeInTheDocument()
    
    // 批准权限
    fireEvent.click(screen.getByText(/approve/i))
    
    // 验证工具执行
    // ... 验证工具输出
  })
  
  it('should handle cancellation during tool execution', async () => {
    // 实现工具执行期间的取消测试
  })
})
```

### 3. 端到端测试 (E2E Tests)

#### 用户交互流程测试
```tsx
// __tests__/e2e/userWorkflow.test.ts
import { test, expect } from '@playwright/test'

test.describe('REPL User Workflows', () => {
  test('should handle normal conversation flow', async ({ page }) => {
    await page.goto('/repl')
    
    // 1. 输入消息
    await page.fill('[data-testid="prompt-input"]', 'Hello, how are you?')
    await page.press('[data-testid="prompt-input"]', 'Enter')
    
    // 2. 验证 loading 状态
    await expect(page.locator('[data-testid="spinner"]')).toBeVisible()
    await expect(page.locator('[data-testid="prompt-input"]')).not.toBeVisible()
    
    // 3. 等待响应
    await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible()
    
    // 4. 验证可以继续对话
    await expect(page.locator('[data-testid="prompt-input"]')).toBeVisible()
  })
  
  test('should handle interruption gracefully', async ({ page }) => {
    await page.goto('/repl')
    
    // 开始长时间运行的操作
    await page.fill('[data-testid="prompt-input"]', 'Perform a complex calculation')
    await page.press('[data-testid="prompt-input"]', 'Enter')
    
    // 等待 loading 状态
    await expect(page.locator('[data-testid="spinner"]')).toBeVisible()
    
    // 按 ESC 中断
    await page.keyboard.press('Escape')
    
    // 验证中断消息
    await expect(page.locator('[data-testid="interrupt-message"]')).toBeVisible()
    
    // 验证回到可用状态
    await expect(page.locator('[data-testid="prompt-input"]')).toBeVisible()
  })
  
  test('should not show multiple input boxes', async ({ page }) => {
    await page.goto('/repl')
    
    // 快速连续操作
    await page.fill('[data-testid="prompt-input"]', 'First message')
    await page.press('[data-testid="prompt-input"]', 'Enter')
    
    // 立即尝试输入另一条消息
    await page.keyboard.press('Escape') // 取消
    
    // 验证只有一个输入框
    const inputCount = await page.locator('[data-testid="prompt-input"]').count()
    expect(inputCount).toBeLessThanOrEqual(1)
  })
})
```

### 4. 性能测试

#### 渲染性能测试
```tsx
// __tests__/performance/renderPerformance.test.ts
describe('REPL Performance', () => {
  it('should render large message history efficiently', async () => {
    const largeMessageHistory = Array.from({ length: 1000 }, (_, i) => ({
      id: `msg-${i}`,
      type: 'assistant' as const,
      content: `Message ${i}: Lorem ipsum dolor sit amet...`,
      timestamp: Date.now() - i * 1000
    }))
    
    const startTime = performance.now()
    
    render(<REPL {...mockProps} initialMessages={largeMessageHistory} />)
    
    // 等待渲染完成
    await screen.findByRole('textbox')
    
    const renderTime = performance.now() - startTime
    
    // 应该在合理时间内完成渲染
    expect(renderTime).toBeLessThan(1000) // 1秒
  })
  
  it('should handle rapid state changes without performance degradation', async () => {
    const { rerender } = render(<REPL {...mockProps} />)
    
    const startTime = performance.now()
    
    // 快速状态变化
    for (let i = 0; i < 100; i++) {
      rerender(<REPL {...mockProps} key={i} />)
    }
    
    const rerenderTime = performance.now() - startTime
    
    expect(rerenderTime).toBeLessThan(500) // 500ms
  })
})
```

### 5. 竞态条件测试

#### 并发操作测试
```tsx
// __tests__/race/concurrentOperations.test.ts
describe('Race Condition Tests', () => {
  it('should handle rapid cancel/start cycles', async () => {
    const { result } = renderHook(() => useRequestState())
    
    // 快速循环：开始 -> 取消 -> 开始 -> 取消
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        result.current.dispatch({ 
          type: 'START_REQUEST', 
          requestId: `test-${i}` 
        })
        
        // 立即取消
        result.current.dispatch({ 
          type: 'CANCEL_REQUEST' 
        })
        
        // 等待状态稳定
        await new Promise(resolve => setTimeout(resolve, 10))
      })
    }
    
    // 最终状态应该是 idle
    expect(result.current.state.status).toBe('idle')
  })
  
  it('should maintain state consistency under concurrent updates', async () => {
    const component = render(<REPL {...mockProps} />)
    
    // 并发操作：同时触发多个状态更新
    const operations = Array.from({ length: 5 }, (_, i) => 
      act(async () => {
        // 模拟用户快速操作
        const input = component.container.querySelector('input')
        if (input) {
          fireEvent.change(input, { target: { value: `message ${i}` } })
          fireEvent.keyPress(input, { key: 'Enter' })
          fireEvent.keyPress(input, { key: 'Escape' })
        }
      })
    )
    
    await Promise.all(operations)
    
    // 验证最终状态一致性
    await waitFor(() => {
      expect(component.container.querySelectorAll('input')).toHaveLength(1)
    })
  })
})
```

## 测试工具和配置

### Jest 配置
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}',
    '<rootDir>/src/**/*.test.{ts,tsx}'
  ],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/__tests__/**/*'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
}
```

### 测试工具设置
```tsx
// __tests__/setup.ts
import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

// 配置测试环境
configure({
  testIdAttribute: 'data-testid'
})

// Mock Ink 相关功能
jest.mock('ink', () => ({
  ...jest.requireActual('ink'),
  useStdin: () => ({ stdin: process.stdin }),
  useStdout: () => ({ stdout: process.stdout })
}))

// Mock 性能 API
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn()
}

// 全局测试工具
global.createMockAbortController = () => ({
  abort: jest.fn(),
  signal: {
    aborted: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }
})
```

## 自动化测试流程

### CI/CD 集成
```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
  
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:integration
  
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
```

## 验证清单

### 功能验证
- [ ] 输入框单一渲染
- [ ] 中断后正确恢复
- [ ] 状态转换原子性
- [ ] 错误边界工作正常
- [ ] 性能监控数据收集

### 性能验证
- [ ] 大量消息渲染 < 1秒
- [ ] 状态更新延迟 < 100ms
- [ ] 内存使用稳定
- [ ] CPU 使用合理

### 稳定性验证
- [ ] 长时间运行无内存泄漏
- [ ] 快速操作无竞态条件
- [ ] 错误恢复完整
- [ ] 中断处理可靠

这套测试策略确保了修复方案的可靠性和长期稳定性。