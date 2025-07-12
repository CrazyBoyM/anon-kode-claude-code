# 第一阶段：紧急修复方案

## 问题1：修复 onCancel() 的竞态条件

### 当前问题代码 (REPL.tsx:170-205)
```tsx
function onCancel() {
  // 🚨 问题：setImmediate 导致异步清理
  setImmediate(() => {
    if (currentRequest === requestToCancel) {
      setCurrentRequest(null)
    }
  })
}
```

### 修复方案：同步原子清理
```tsx
function onCancel() {
  if (!isLoading || !currentRequest?.isActive) {
    return
  }

  // 🔧 原子状态更新 - 使用 React 18 的自动批处理
  React.startTransition(() => {
    // 立即显示中断消息
    const interruptMessage = createAssistantMessage(INTERRUPT_MESSAGE)
    
    // 创建不可变的请求引用
    const requestToCancel = currentRequest
    const newRequest = { ...requestToCancel, isActive: false }
    
    // 原子更新所有相关状态
    setMessages(oldMessages => [...oldMessages, interruptMessage])
    setCurrentRequest(null)  // 🔧 同步清理，不延迟
    setIsLoading(false)
    setToolJSX(null)
    setToolUseConfirm(null)
    setBinaryFeedbackContext(null)
    
    // 安全中止请求
    try {
      requestToCancel.abortController.abort(new Error('User cancellation'))
    } catch (error) {
      // AbortController 可能已经中止，忽略错误
    }
  })

  // 处理工具确认的特殊清理
  if (toolUseConfirm) {
    toolUseConfirm.onAbort()
  }
}
```

## 问题2：防止重复输入框渲染

### 当前问题代码 (REPL.tsx:697-739)
```tsx
// 🚨 问题：6个条件的复杂组合，易导致竞态
{!toolUseConfirm && !toolJSX?.shouldHidePromptInput && shouldShowPromptInput && 
 !isMessageSelectorVisible && !binaryFeedbackContext && !showingCostDialog && (
  <PromptInput ... />
)}
```

### 修复方案：稳定的渲染条件
```tsx
// 使用 useMemo 稳定渲染决策
const renderingState = useMemo(() => {
  // 定义互斥的 UI 状态
  if (toolUseConfirm) return { type: 'permission', component: 'ToolUseConfirm' }
  if (toolJSX) return { type: 'tool', component: 'ToolJSX' }
  if (binaryFeedbackContext && !isMessageSelectorVisible) return { type: 'feedback', component: 'BinaryFeedback' }
  if (isMessageSelectorVisible) return { type: 'selector', component: 'MessageSelector' }
  if (showingCostDialog) return { type: 'cost', component: 'CostDialog' }
  if (isLoading && currentRequest?.isActive) return { type: 'loading', component: 'Spinner' }
  if (shouldShowPromptInput) return { type: 'input', component: 'PromptInput' }
  
  return { type: 'unknown', component: null }
}, [toolUseConfirm, toolJSX, binaryFeedbackContext, isMessageSelectorVisible, 
    showingCostDialog, isLoading, currentRequest?.isActive, shouldShowPromptInput])

// 渲染逻辑
const renderMainContent = () => {
  switch (renderingState.type) {
    case 'permission':
      return <ToolUseConfirm {...toolUseConfirm} />
    case 'tool':
      return toolJSX.jsx
    case 'feedback':
      return <BinaryFeedback {...binaryFeedbackContext} />
    case 'selector':
      return <MessageSelector {...} />
    case 'cost':
      return <CostThresholdDialog {...} />
    case 'loading':
      return <Spinner />
    case 'input':
      return <PromptInput {...} />
    default:
      return null
  }
}

// 在 JSX 中使用
{renderMainContent()}
```

## 问题3：增强状态验证

### 添加状态一致性检查
```tsx
// 添加开发环境下的状态验证
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    // 验证状态一致性
    const inconsistencies = []
    
    if (isLoading && !currentRequest) {
      inconsistencies.push('isLoading=true but currentRequest=null')
    }
    
    if (currentRequest && !currentRequest.isActive && isLoading) {
      inconsistencies.push('currentRequest.isActive=false but isLoading=true')
    }
    
    const activeUIComponents = [
      toolUseConfirm ? 'toolUseConfirm' : null,
      toolJSX ? 'toolJSX' : null,
      binaryFeedbackContext ? 'binaryFeedbackContext' : null,
      isMessageSelectorVisible ? 'messageSelector' : null,
      showingCostDialog ? 'costDialog' : null
    ].filter(Boolean)
    
    if (activeUIComponents.length > 1) {
      inconsistencies.push(`Multiple UI components active: ${activeUIComponents.join(', ')}`)
    }
    
    if (inconsistencies.length > 0) {
      console.warn('REPL State Inconsistencies:', inconsistencies)
    }
  }
}, [isLoading, currentRequest, toolUseConfirm, toolJSX, binaryFeedbackContext, 
    isMessageSelectorVisible, showingCostDialog])
```

## 实施建议

1. **优先级**：先实施 onCancel() 修复，因为它影响用户体验最严重
2. **测试**：每个修复都应该有对应的测试场景
3. **监控**：添加状态验证可以帮助发现其他潜在问题
4. **渐进式**：可以分别实施，不会相互冲突

## 预期效果

- ✅ 消除重复输入框渲染
- ✅ 修复中断后卡住的视觉状态
- ✅ 提供更稳定的用户体验
- ✅ 为后续架构重构奠定基础