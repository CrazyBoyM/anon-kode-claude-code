# 第二阶段：架构重构方案

## 核心设计：统一状态机模式

### 问题分析
当前 REPL 组件有21个状态变量，缺乏统一控制，导致状态不一致和竞态条件。

### 解决方案：Request State Machine

```tsx
// types/RequestState.ts
export type RequestState = 
  | { status: 'idle' }
  | { 
      status: 'loading'
      requestId: string
      abortController: AbortController
      startTime: number
    }
  | {
      status: 'tool_permission'
      requestId: string
      abortController: AbortController
      permission: ToolUseConfirm
    }
  | {
      status: 'binary_feedback'
      requestId: string
      abortController: AbortController
      context: BinaryFeedbackContext
    }
  | {
      status: 'tool_executing'
      requestId: string
      abortController: AbortController
      toolJSX: ToolJSX
    }
  | {
      status: 'cancelled'
      requestId: string
      reason: 'user_cancel' | 'timeout' | 'error'
    }
  | {
      status: 'completed'
      requestId: string
      result?: any
    }

export type RequestAction =
  | { type: 'START_REQUEST'; requestId: string }
  | { type: 'REQUEST_TOOL_PERMISSION'; permission: ToolUseConfirm }
  | { type: 'REQUEST_BINARY_FEEDBACK'; context: BinaryFeedbackContext }
  | { type: 'START_TOOL_EXECUTION'; toolJSX: ToolJSX }
  | { type: 'CANCEL_REQUEST'; reason?: string }
  | { type: 'COMPLETE_REQUEST'; result?: any }
  | { type: 'RESET_TO_IDLE' }

// hooks/useRequestState.ts
function requestReducer(state: RequestState, action: RequestAction): RequestState {
  switch (action.type) {
    case 'START_REQUEST': {
      // 只有在 idle 状态才能开始新请求
      if (state.status !== 'idle') {
        console.warn(`Cannot start request from ${state.status} state`)
        return state
      }
      
      return {
        status: 'loading',
        requestId: action.requestId,
        abortController: new AbortController(),
        startTime: Date.now()
      }
    }
    
    case 'REQUEST_TOOL_PERMISSION': {
      // 只有在 loading 状态才能请求权限
      if (state.status !== 'loading') {
        console.warn(`Cannot request permission from ${state.status} state`)
        return state
      }
      
      return {
        ...state,
        status: 'tool_permission',
        permission: action.permission
      }
    }
    
    case 'CANCEL_REQUEST': {
      // 可以从任何活跃状态取消
      if (!isActiveState(state)) {
        return state
      }
      
      // 中止当前请求
      if ('abortController' in state) {
        try {
          state.abortController.abort(new Error(`Request cancelled: ${action.reason || 'user_cancel'}`))
        } catch (error) {
          // AbortController 可能已经中止
        }
      }
      
      return {
        status: 'cancelled',
        requestId: 'requestId' in state ? state.requestId : 'unknown',
        reason: (action.reason as any) || 'user_cancel'
      }
    }
    
    case 'RESET_TO_IDLE': {
      return { status: 'idle' }
    }
    
    default:
      return state
  }
}

function isActiveState(state: RequestState): boolean {
  return ['loading', 'tool_permission', 'binary_feedback', 'tool_executing'].includes(state.status)
}

export function useRequestState() {
  const [state, dispatch] = useReducer(requestReducer, { status: 'idle' })
  
  // 自动清理取消状态
  useEffect(() => {
    if (state.status === 'cancelled' || state.status === 'completed') {
      const timer = setTimeout(() => {
        dispatch({ type: 'RESET_TO_IDLE' })
      }, 100) // 给 UI 更新留出时间
      
      return () => clearTimeout(timer)
    }
  }, [state.status])
  
  return { state, dispatch }
}
```

### 重构后的 REPL 组件

```tsx
// screens/REPL.tsx (重构版本)
export function REPL(props: REPLProps) {
  // 🔧 使用统一状态机替换多个状态
  const { state: requestState, dispatch: requestDispatch } = useRequestState()
  
  // 🔧 简化的 UI 状态
  const [messages, setMessages] = useState<MessageType[]>(props.initialMessages || [])
  const [inputValue, setInputValue] = useState('')
  const [inputMode, setInputMode] = useState<'bash' | 'prompt' | 'koding'>('prompt')
  const [isMessageSelectorVisible, setIsMessageSelectorVisible] = useState(false)
  const [showingCostDialog, setShowingCostDialog] = useState(false)
  
  // 🔧 派生状态，不再需要手动同步
  const isLoading = isActiveState(requestState)
  const currentRequest = 'abortController' in requestState ? {
    id: requestState.requestId,
    abortController: requestState.abortController,
    isActive: isActiveState(requestState)
  } : null
  
  // 🔧 简化的取消逻辑
  const onCancel = useCallback(() => {
    if (!isActiveState(requestState)) {
      return
    }
    
    // 显示中断消息
    const interruptMessage = createAssistantMessage(INTERRUPT_MESSAGE)
    setMessages(prev => [...prev, interruptMessage])
    
    // 原子状态更新
    requestDispatch({ type: 'CANCEL_REQUEST', reason: 'user_cancel' })
  }, [requestState, requestDispatch])
  
  // 🔧 统一的请求启动逻辑
  const onQuery = useCallback(async (newMessages: MessageType[]) => {
    const requestId = crypto.randomUUID()
    
    // 开始新请求
    requestDispatch({ type: 'START_REQUEST', requestId })
    
    try {
      // 获取当前状态
      const currentState = requestState
      if (currentState.status !== 'loading') {
        throw new Error('Request state is not loading')
      }
      
      // 执行查询逻辑
      await executeQuery(newMessages, currentState.abortController, requestDispatch)
      
      // 完成请求
      requestDispatch({ type: 'COMPLETE_REQUEST' })
      
    } catch (error) {
      if (error.name === 'AbortError') {
        // 请求被取消，状态已经更新
        return
      }
      
      // 处理其他错误
      console.error('Query failed:', error)
      requestDispatch({ type: 'CANCEL_REQUEST', reason: 'error' })
    }
  }, [requestState, requestDispatch])
  
  // 🔧 简化的渲染逻辑
  const renderMainUI = () => {
    switch (requestState.status) {
      case 'idle':
        return (
          <PromptInput
            isLoading={false}
            onQuery={onQuery}
            input={inputValue}
            onInputChange={setInputValue}
            mode={inputMode}
            onModeChange={setInputMode}
            // ... 其他 props
          />
        )
      
      case 'loading':
        return <Spinner />
      
      case 'tool_permission':
        return (
          <ToolPermissionDialog
            permission={requestState.permission}
            onApprove={() => {
              requestState.permission.onApprove()
              requestDispatch({ type: 'START_TOOL_EXECUTION', toolJSX: requestState.permission.toolJSX })
            }}
            onReject={() => {
              requestState.permission.onReject()
              requestDispatch({ type: 'CANCEL_REQUEST', reason: 'permission_denied' })
            }}
          />
        )
      
      case 'binary_feedback':
        return (
          <BinaryFeedback
            context={requestState.context}
            resolve={(result) => {
              requestState.context.resolve(result)
              requestDispatch({ type: 'COMPLETE_REQUEST', result })
            }}
          />
        )
      
      case 'tool_executing':
        return requestState.toolJSX.jsx
      
      case 'cancelled':
      case 'completed':
        // 显示完成状态，然后自动回到 idle
        return <PromptInput isLoading={false} onQuery={onQuery} {...inputProps} />
      
      default:
        return null
    }
  }
  
  return (
    <Box flexDirection="column" width="100%">
      {/* 消息历史 */}
      {messages.map((message, index) => (
        <MessageComponent key={index} message={message} />
      ))}
      
      {/* 主 UI 区域 */}
      {renderMainUI()}
      
      {/* 覆盖层 UI */}
      {isMessageSelectorVisible && (
        <MessageSelector onSelect={() => setIsMessageSelectorVisible(false)} />
      )}
      
      {showingCostDialog && (
        <CostThresholdDialog onDone={() => setShowingCostDialog(false)} />
      )}
    </Box>
  )
}
```

## 实施计划

### 第一步：创建状态机基础设施
1. 创建 `types/RequestState.ts`
2. 创建 `hooks/useRequestState.ts`
3. 添加单元测试

### 第二步：逐步迁移 REPL 组件
1. 替换 `currentRequest` 和 `isLoading` 状态
2. 重构 `onCancel()` 函数
3. 重构 `onQuery()` 函数
4. 简化渲染逻辑

### 第三步：清理遗留代码
1. 移除不再需要的状态变量
2. 更新相关组件的接口
3. 添加集成测试

## 预期收益

- ✅ **消除竞态条件**：所有状态转换都是原子的
- ✅ **简化 UI 逻辑**：每个状态对应唯一 UI
- ✅ **更好的可测试性**：状态机易于单元测试
- ✅ **更好的可维护性**：状态转换逻辑集中管理
- ✅ **更好的调试体验**：清晰的状态历史记录