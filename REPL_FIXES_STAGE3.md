# 第三阶段：性能优化和监控方案

## 渲染性能优化

### 问题分析
当前 REPL 组件在每次状态更新时都会重新渲染整个消息历史，这在长对话中会导致性能问题。

### 优化策略

#### 1. 消息虚拟化
```tsx
// components/VirtualizedMessageList.tsx
import { FixedSizeList as List } from 'react-window'
import { useMemo } from 'react'

interface VirtualizedMessageListProps {
  messages: MessageType[]
  height: number
  itemHeight: number
}

export function VirtualizedMessageList({ messages, height, itemHeight }: VirtualizedMessageListProps) {
  const memoizedMessages = useMemo(() => messages, [messages])
  
  const Row = useCallback(({ index, style }) => (
    <div style={style}>
      <MessageComponent 
        message={memoizedMessages[index]} 
        isStatic={true}
      />
    </div>
  ), [memoizedMessages])
  
  return (
    <List
      height={height}
      itemCount={messages.length}
      itemSize={itemHeight}
      itemData={memoizedMessages}
    >
      {Row}
    </List>
  )
}
```

#### 2. 消息组件优化
```tsx
// components/OptimizedMessageComponent.tsx
import { memo, useMemo } from 'react'

interface MessageComponentProps {
  message: MessageType
  isStatic?: boolean
  onToolUse?: (toolId: string) => void
}

export const MessageComponent = memo<MessageComponentProps>(({ 
  message, 
  isStatic = false,
  onToolUse 
}) => {
  // 🔧 只有在非静态模式或消息内容变化时才重新计算
  const processedContent = useMemo(() => {
    if (isStatic && message.type === 'assistant') {
      // 静态消息使用缓存的处理结果
      return message.cachedContent || processMessage(message.content)
    }
    return processMessage(message.content)
  }, [message, isStatic])
  
  // 🔧 工具使用回调优化
  const handleToolUse = useCallback((toolId: string) => {
    if (!isStatic && onToolUse) {
      onToolUse(toolId)
    }
  }, [isStatic, onToolUse])
  
  return (
    <Box flexDirection="column">
      {/* 渲染逻辑 */}
      {processedContent}
    </Box>
  )
}, (prevProps, nextProps) => {
  // 🔧 自定义比较函数
  return (
    prevProps.message === nextProps.message &&
    prevProps.isStatic === nextProps.isStatic &&
    prevProps.onToolUse === nextProps.onToolUse
  )
})
```

#### 3. 状态更新优化
```tsx
// hooks/useOptimizedREPL.ts
export function useOptimizedREPL() {
  // 🔧 使用 useCallback 稳定函数引用
  const stableCallbacks = useMemo(() => ({
    onMessageUpdate: useCallback((messageId: string, updates: Partial<MessageType>) => {
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      ))
    }, []),
    
    onMessageAdd: useCallback((newMessage: MessageType) => {
      setMessages(prev => [...prev, newMessage])
    }, []),
    
    onMessageRemove: useCallback((messageId: string) => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId))
    }, [])
  }), [])
  
  // 🔧 使用 useDeferredValue 延迟非关键更新
  const deferredMessages = useDeferredValue(messages)
  
  return {
    messages: deferredMessages,
    ...stableCallbacks
  }
}
```

## 监控和调试系统

### 1. 状态变化监控
```tsx
// utils/stateMonitor.ts
interface StateChange {
  timestamp: number
  component: string
  stateName: string
  oldValue: any
  newValue: any
  stackTrace?: string
}

class StateMonitor {
  private changes: StateChange[] = []
  private maxHistorySize = 1000
  
  recordChange(component: string, stateName: string, oldValue: any, newValue: any) {
    if (process.env.NODE_ENV !== 'development') return
    
    const change: StateChange = {
      timestamp: Date.now(),
      component,
      stateName,
      oldValue,
      newValue,
      stackTrace: new Error().stack
    }
    
    this.changes.push(change)
    
    // 保持历史大小在限制内
    if (this.changes.length > this.maxHistorySize) {
      this.changes.shift()
    }
    
    // 检测潜在问题
    this.detectAnomalies(change)
  }
  
  private detectAnomalies(change: StateChange) {
    // 检测快速状态变化（可能的无限循环）
    const recentChanges = this.changes.filter(c => 
      c.timestamp > Date.now() - 1000 && 
      c.component === change.component &&
      c.stateName === change.stateName
    )
    
    if (recentChanges.length > 10) {
      console.warn(`Rapid state changes detected in ${change.component}.${change.stateName}`, recentChanges)
    }
    
    // 检测状态不一致
    if (change.stateName === 'isLoading' && change.newValue === true) {
      // 检查是否有对应的 currentRequest
      setTimeout(() => {
        const currentRequest = this.getLatestState(change.component, 'currentRequest')
        if (!currentRequest) {
          console.warn('isLoading=true but no currentRequest found')
        }
      }, 0)
    }
  }
  
  getLatestState(component: string, stateName: string) {
    const latest = this.changes
      .filter(c => c.component === component && c.stateName === stateName)
      .pop()
    return latest?.newValue
  }
  
  exportHistory() {
    return this.changes.slice()
  }
}

export const stateMonitor = new StateMonitor()

// Hook for monitoring state changes
export function useStateMonitor<T>(
  componentName: string, 
  stateName: string, 
  value: T
): T {
  const prevValue = useRef<T>()
  
  useEffect(() => {
    if (prevValue.current !== undefined && prevValue.current !== value) {
      stateMonitor.recordChange(componentName, stateName, prevValue.current, value)
    }
    prevValue.current = value
  }, [componentName, stateName, value])
  
  return value
}
```

### 2. 性能监控
```tsx
// utils/performanceMonitor.ts
interface PerformanceMetric {
  name: string
  duration: number
  timestamp: number
  metadata?: Record<string, any>
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private activeTimers = new Map<string, number>()
  
  startTimer(name: string, metadata?: Record<string, any>) {
    this.activeTimers.set(name, performance.now())
    return () => this.endTimer(name, metadata)
  }
  
  endTimer(name: string, metadata?: Record<string, any>) {
    const startTime = this.activeTimers.get(name)
    if (!startTime) return
    
    const duration = performance.now() - startTime
    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
      metadata
    })
    
    this.activeTimers.delete(name)
    
    // 警告慢操作
    if (duration > 100) {
      console.warn(`Slow operation detected: ${name} took ${duration.toFixed(2)}ms`, metadata)
    }
  }
  
  getMetrics(name?: string) {
    return name 
      ? this.metrics.filter(m => m.name === name)
      : this.metrics.slice()
  }
  
  getAverageTime(name: string, windowSize = 10) {
    const recent = this.metrics
      .filter(m => m.name === name)
      .slice(-windowSize)
    
    if (recent.length === 0) return 0
    
    return recent.reduce((sum, m) => sum + m.duration, 0) / recent.length
  }
}

export const performanceMonitor = new PerformanceMonitor()

// Hook for measuring component render time
export function useRenderPerformance(componentName: string) {
  useLayoutEffect(() => {
    const endTimer = performanceMonitor.startTimer(`${componentName}_render`)
    return endTimer
  })
}
```

### 3. 错误边界和恢复
```tsx
// components/REPLErrorBoundary.tsx
interface REPLErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  errorId?: string
}

export class REPLErrorBoundary extends Component<
  PropsWithChildren<{}>,
  REPLErrorBoundaryState
> {
  constructor(props: PropsWithChildren<{}>) {
    super(props)
    this.state = { hasError: false }
  }
  
  static getDerivedStateFromError(error: Error): Partial<REPLErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: crypto.randomUUID()
    }
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    
    // 记录错误详情
    console.error('REPL Error Boundary caught error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId
    })
    
    // 发送错误报告（如果需要）
    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, errorInfo)
    }
  }
  
  private reportError(error: Error, errorInfo: ErrorInfo) {
    // 实现错误报告逻辑
    // 可以发送到错误追踪服务
  }
  
  private handleRecovery = () => {
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      errorId: undefined 
    })
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" padding={2}>
          <Text color="red" bold>Something went wrong in the REPL</Text>
          <Text>Error ID: {this.state.errorId}</Text>
          <Text wrap="wrap">{this.state.error?.message}</Text>
          
          <Box marginTop={1}>
            <Text bold>What you can do:</Text>
            <Text>• Press Enter to try recovering</Text>
            <Text>• Restart the application if problems persist</Text>
          </Box>
          
          <TextInput 
            placeholder="Press Enter to recover..."
            onSubmit={this.handleRecovery}
          />
        </Box>
      )
    }
    
    return this.props.children
  }
}
```

## 调试工具

### 1. 开发者控制台
```tsx
// components/DevConsole.tsx
export function DevConsole() {
  const [isVisible, setIsVisible] = useState(false)
  const [command, setCommand] = useState('')
  
  useInput((input, key) => {
    if (key.ctrl && input === 'd') {
      setIsVisible(!isVisible)
    }
  })
  
  if (!isVisible || process.env.NODE_ENV !== 'development') {
    return null
  }
  
  const handleCommand = (cmd: string) => {
    const [action, ...args] = cmd.split(' ')
    
    switch (action) {
      case 'state':
        console.log('Current REPL state:', stateMonitor.exportHistory().slice(-10))
        break
      
      case 'performance':
        const metric = args[0]
        console.log(`Performance for ${metric}:`, performanceMonitor.getMetrics(metric))
        break
      
      case 'clear':
        console.clear()
        break
      
      default:
        console.log('Available commands: state, performance <metric>, clear')
    }
    
    setCommand('')
  }
  
  return (
    <Box 
      position="absolute" 
      top={0} 
      left={0} 
      right={0} 
      bottom={0} 
      backgroundColor="black"
      borderStyle="double"
      flexDirection="column"
      zIndex={1000}
    >
      <Text bold color="cyan">Developer Console (Ctrl+D to toggle)</Text>
      <TextInput 
        placeholder="Enter command..."
        value={command}
        onChange={setCommand}
        onSubmit={handleCommand}
      />
    </Box>
  )
}
```

## 实施优先级

### 高优先级（立即实施）
1. 错误边界和基础监控
2. 状态变化监控
3. 关键性能指标收集

### 中优先级（2-4周内）
1. 消息渲染优化
2. 虚拟化实现
3. 性能监控完善

### 低优先级（1-2个月内）
1. 开发者控制台
2. 高级调试功能
3. 自动化性能测试

## 预期收益

- ✅ **50%+ 渲染性能提升**：通过虚拟化和优化
- ✅ **实时问题监控**：及早发现和修复问题
- ✅ **更好的错误恢复**：用户可以从错误中恢复而不重启
- ✅ **数据驱动优化**：基于真实性能数据进行改进
- ✅ **开发体验提升**：更好的调试工具和错误信息