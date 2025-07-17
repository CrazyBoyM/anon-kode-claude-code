# setAbortController 错误修复计划

## 问题分析总结

### 根本原因
1. **架构不一致**：REPL.tsx 已迁移到 `currentRequest` 状态管理，但 PromptInput.tsx 仍使用旧的 `setAbortController` 模式
2. **废弃 prop 未清理**：`setAbortController` 被标记为废弃但代码中仍在使用
3. **职责边界模糊**：PromptInput 试图管理 AbortController 生命周期，但这应该由 REPL 负责

### 错误触发点
- **文件**: `src/components/PromptInput.tsx`
- **位置**: 第231行和第340行
- **代码**: `setAbortController(null)`
- **问题**: 调用了已废弃的 prop 函数

## 修复方案

### 方案1：完全移除 setAbortController（推荐）

#### 步骤1：从 PromptInput 组件移除 setAbortController 相关代码
```typescript
// 移除 Props 接口中的定义
// setAbortController: (abortController: AbortController | null) => void

// 移除参数解构
// setAbortController,

// 替换调用点
// 第231行：setAbortController(null) -> 移除（不需要清理）
// 第340行：setAbortController(null) -> 移除（不需要清理）
```

#### 步骤2：从 REPL 组件移除 setAbortController prop
```typescript
// 移除 PromptInput 的 setAbortController prop
// setAbortController={controller => {
//   // This prop is now deprecated - request context management is handled internally
//   // Only used for cleanup purposes
// }}
```

#### 步骤3：重构 AbortController 管理逻辑
- **原理**：REPL 组件通过 `currentRequest` 状态完全管理 AbortController 生命周期
- **PromptInput 职责**：只负责用户输入处理，不管理 AbortController 状态
- **REPL 职责**：创建、管理和清理 AbortController

### 方案2：保留兼容性（备选）

#### 如果需要保持向后兼容性
```typescript
// 在 REPL.tsx 中提供实际的清理函数
setAbortController={(controller) => {
  if (controller === null && currentRequest) {
    // 清理当前请求
    setCurrentRequest(null)
  }
}}
```

## 实施计划

### 阶段1：清理 PromptInput 组件
1. 移除 `setAbortController` 相关的 props 定义
2. 移除组件内部的 `setAbortController(null)` 调用
3. 更新组件的 TypeScript 类型定义

### 阶段2：更新 REPL 组件
1. 移除传递给 PromptInput 的 `setAbortController` prop
2. 确保 `currentRequest` 状态管理逻辑完整

### 阶段3：测试验证
1. 测试正常查询流程
2. 测试 ESC 键取消操作
3. 测试 slash 命令执行
4. 测试错误处理和状态清理

### 阶段4：代码清理
1. 移除不必要的注释
2. 优化状态管理逻辑
3. 更新相关文档

## 风险评估

### 低风险
- 移除废弃的 prop 不会影响核心功能
- 当前的 `currentRequest` 管理已经工作正常

### 中风险
- 可能存在其他组件依赖旧的 `setAbortController` 模式
- 需要彻底测试所有取消操作场景

### 高风险
- 无明显高风险点

## 验证标准

### 功能验证
- [ ] 用户输入正常处理
- [ ] ESC 键取消操作正常
- [ ] 查询完成后状态正确清理
- [ ] 错误情况下的状态恢复

### 性能验证
- [ ] 无内存泄漏
- [ ] 状态更新响应及时
- [ ] 无不必要的重新渲染

### 兼容性验证
- [ ] 所有 slash 命令正常工作
- [ ] 不同输入模式（prompt/bash/koding）正常切换
- [ ] 多轮对话状态管理正确

## 预期效果

1. **错误消除**：完全解决 `setAbortController is not defined` 错误
2. **架构统一**：所有组件使用一致的状态管理模式
3. **代码简化**：移除废弃代码，提高可维护性
4. **性能提升**：减少不必要的状态传递和更新

## 实施时间估计

- **阶段1**: 30分钟
- **阶段2**: 15分钟
- **阶段3**: 45分钟
- **阶段4**: 30分钟
- **总计**: 2小时

## 后续优化建议

1. **状态管理优化**：考虑使用 Context 或 Reducer 进一步简化状态管理
2. **错误处理增强**：添加更多的边界条件检查
3. **性能监控**：添加 AbortController 生命周期的性能监控
4. **文档更新**：更新 AbortController 使用文档