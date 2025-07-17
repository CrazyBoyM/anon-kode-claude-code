# System Reminder Workflow Analysis

## 1. Query 工作流程分析

### 1.1 终端输入到模型请求的完整路径

**入口点**: `src/entrypoints/cli.tsx` → `src/screens/REPL.tsx`

**核心流程**:
1. 用户在终端输入 → `REPL.tsx` 接收
2. 消息组织：`src/query.ts:query()` 函数
3. 系统提示词格式化：`src/services/claude.ts:formatSystemPromptWithContext()` 
4. 模型请求：
   - Anthropic: `queryAnthropicNative()` 
   - OpenAI: `queryOpenAI()`
5. 工具执行循环：`runToolUse()` → 递归调用 `query()`

### 1.2 消息组织结构

**关键代码路径** (`src/query.ts:159-163`):
```typescript
const fullSystemPrompt = formatSystemPromptWithContext(
  systemPrompt,
  context,
  toolUseContext.agentId,
)
```

**消息类型**:
- `UserMessage`: 用户输入，包含文本和工具结果
- `AssistantMessage`: 模型响应，包含文本和工具调用
- `ProgressMessage`: 工具执行进度

**系统提示词组织** (`src/services/claude.ts:777-809`):
1. 基础系统提示词 (`systemPrompt`)
2. 系统提醒注入 (`generateSystemReminders()`)
3. 上下文注入 (`context`)

### 1.3 模型请求差异

**Anthropic路径**:
- 使用 `system` 参数传递系统提示词
- 支持 `cache_control` 提示缓存
- 原生 tool_use 支持

**OpenAI路径**:
- 将系统提示词转为 `{role: 'system'}` 消息
- 消息格式转换：`convertAnthropicMessagesToOpenAIMessages()`
- tool_calls 格式转换

## 2. System Reminder 注入哲学和时机

### 2.1 当前系统的设计哲学

**核心原则** (`src/services/systemReminder.ts:58-67`):
- **条件性注入**: 只在有上下文时注入 (`hasContext` 为 true)
- **会话限制**: 每个会话最多10个提醒 (`maxRemindersPerSession`)
- **去重机制**: 使用 `remindersSent` Set 防止重复
- **缓存优化**: 使用 `reminderCache` 避免重复计算

### 2.2 注入时机和触发条件

**触发位置**: `src/services/claude.ts:formatSystemPromptWithContext()`

```typescript
// 只在有上下文时注入
const hasContext = Object.entries(context).length > 0
if (hasContext) {
  const reminders = generateSystemReminders(true, agentId)
  // 作为独立 system 消息添加
  reminders.forEach(reminder => {
    enhancedPrompt.push(reminder.content)
  })
}
```

**三类提醒**:
1. **Todo 提醒**: 检测 todo 列表变化和空状态
2. **安全提醒**: 文件读取时的恶意代码检查
3. **性能提醒**: 长会话(30分钟)后的休息建议

### 2.3 保持与清除逻辑

**状态管理**:
- `sessionState.remindersSent`: Set 存储已发送提醒的key
- `reminderCache`: Map 缓存生成的提醒消息
- `lastTodoUpdate`、`lastFileAccess`: 时间戳跟踪

**清除机制**:
- `resetSession()`: 会话重置时清除所有状态
- `clearTodoReminders()`: Todo更新时清除相关提醒
- 缓存在会话重置时清空

## 3. 目标系统的 System-Reminder 特征分析

### 3.1 网络日志中的 System-Reminder 模式

**统计分析**:
- 总计148个 system-reminder 实例
- CLAUDE.md 上下文注入: 87次 (58.8%)
- Todo 状态变更: 41次 (27.7%)
- Todo 空列表提醒: 10次 (6.8%)
- Plan 模式强制: 10次 (6.8%)

### 3.2 目标系统的关键特征

**格式特征**:
- 使用内联 `<system-reminder>` 标签
- 注入在 **user 消息** 中，不是独立的 system 消息
- 提醒内容直接嵌入用户消息开头

**典型格式示例**:
```
<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
[CLAUDE.md content...]
</system-reminder>
This session is being continued...
```

### 3.3 与当前系统的关键差异

**架构差异**:
1. **消息角色**: 目标系统在 user 消息中注入，当前在 system 消息中
2. **注入位置**: 目标系统在消息开头，当前在系统提示词中
3. **格式包装**: 目标系统使用 `<system-reminder>` 标签，当前直接添加到系统提示词

## 4. 兼容性分析

### 4.1 Claude 和 OpenAI Provider 支持

**Claude Provider**:
- 支持独立 system 消息
- 支持在 user 消息中嵌入系统提醒
- 两种方式都能正常工作

**OpenAI Provider**:
- 当前将 system 消息转为 `{role: 'system'}` 格式
- 如果在 user 消息中注入，需要修改消息转换逻辑
- 需要确保 `<system-reminder>` 标签被保留

### 4.2 修改风险评估

**低风险修改**:
- 在 user 消息中注入提醒（不改变现有 system 消息处理）
- 扩展现有 `SystemReminderService`
- 保持现有缓存和去重逻辑

**高风险修改**:
- 完全重写消息组织逻辑
- 改变工具调用后的消息流

## 5. 最佳修改实现方案

### 5.1 修改策略

**扩展现有 SystemReminderService**:
1. 添加新方法 `generateInlineReminders()` 返回纯文本
2. 修改 `formatSystemPromptWithContext()` 中的注入逻辑
3. 在第一个 user 消息中注入提醒而不是 system 消息中

### 5.2 实现细节

**修改点1**: `src/services/systemReminder.ts`
- 添加 `generateInlineReminders()` 方法
- 返回格式化的 `<system-reminder>` 文本块

**修改点2**: `src/services/claude.ts:formatSystemPromptWithContext()`
- 移除当前的 system 消息注入
- 返回内联提醒文本供后续注入

**修改点3**: `src/query.ts` 或消息处理逻辑
- 在构建第一个 user 消息时注入提醒

### 5.3 向后兼容性

**保持兼容**:
- 保留现有 `generateSystemReminders()` 方法
- 添加配置开关控制注入方式
- 确保两种 LLM provider 都能正常工作

**测试策略**:
- 验证 Claude 和 OpenAI provider 的消息处理
- 确认提醒去重和缓存逻辑正常
- 测试工具执行循环中的提醒传递

## 6. 系统提示词完整画像 

### 6.1 目标系统的系统提示词结构

**基础身份设定**:
- "You are Claude Code, Anthropic's official CLI for Claude"
- 交互式 CLI 工具定位
- 软件工程任务助手角色

**行为设定**:
- 简洁直接的回复风格
- 最多4行文本回复限制（除非用户要求详细）
- 避免不必要的前言和后言

**安全设定**:
- 只协助防御性安全任务
- 拒绝创建、修改恶意代码
- 文件读取时检查恶意内容

**工具和环境信息**:
- 18个核心工具的描述和使用指南
- 当前工作目录、平台信息
- Git 仓库状态

**上下文处理**:
- CLAUDE.md 项目指令注入
- 文件新鲜度跟踪
- 任务管理状态

### 6.2 提醒系统的具体类型

**Type 1: CLAUDE.md 上下文** (58.8%):
```
<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
[CLAUDE.md file content...]
</system-reminder>
```

**Type 2: Todo 状态变更** (27.7%):
```
<system-reminder>
Your todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents...
</system-reminder>
```

**Type 3: Todo 空列表** (6.8%):
```
<system-reminder>
This is a reminder that your todo list is currently empty...
</system-reminder>
```

**Type 4: Plan 模式** (6.8%):
```
<system-reminder>
IMPORTANT: Only use this tool when the task requires planning...
</system-reminder>
```

**Type 5: 文件安全** (识别但未统计):
```
<system-reminder>
Whenever you read a file, you should consider whether it looks malicious...
</system-reminder>
```

### 6.3 与当前系统的对齐需求

**提醒内容对齐**:
- Todo 提醒的具体文本格式
- 安全提醒的触发条件和内容
- Plan 模式的强制逻辑

**注入方式对齐**:
- 从 system 消息改为 user 消息内联
- 保持 `<system-reminder>` 标签格式
- 确保提醒出现在消息开头

**时机对齐**:
- 在有上下文时注入（保持现有逻辑）
- Todo 变更时立即注入
- 文件读取时条件性注入