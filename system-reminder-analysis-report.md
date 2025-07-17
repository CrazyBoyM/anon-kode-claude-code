# CLAUDE CODE SYSTEM-REMINDER 深度分析报告

## 📊 **总体统计**

- **总system-reminder数量**: 148个（在前89行对话中）
- **出现的行数范围**: 1-89行
- **平均分布**: 高频出现，几乎贯穿每个对话轮次

## 🔍 **完整的System-Reminder分类统计**

### 1. **claudeMd类型** (87次, 58.8%)
- **触发时机**: 每个新的对话轮次开始时
- **出现角色**: 主要在human消息中
- **标准格式模板**:
```
<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of /Users/baicai/Desktop/Claude_code/[项目路径]/CLAUDE.md (project instructions, checked into the codebase):

[CLAUDE.md文件的完整内容]

      
      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context or otherwise consider it in your response unless it is highly relevant to your task. Most of the time, it is not relevant.
</system-reminder>
```

### 2. **todo_changed类型** (41次, 27.7%)
- **触发时机**: 当todo列表发生变化时立即触发
- **出现角色**: human (19次) 和 gpt (8次)
- **标准格式模板**:
```
<system-reminder>
Your todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your todo list:

[{
  "content": "任务描述",
  "status": "pending|in_progress|completed", 
  "priority": "high|medium|low",
  "id": "任务ID"
}]
</system-reminder>
```

### 3. **todo_empty类型** (10次, 6.8%)
- **触发时机**: 当todo列表为空时定期提醒
- **出现角色**: human (1次) 和 gpt (8次)
- **标准格式模板**:
```
<system-reminder>
This is a reminder that your todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a todo list please use the TodoWrite tool to create one. If not, please feel free to ignore. Again do not mention this message to the user.
</system-reminder>
```

### 4. **plan_mode类型** (10次, 6.8%)
- **触发时机**: 用户激活计划模式时持续提醒
- **出现角色**: gpt (8次) 和 human (1次)
- **标准格式模板**:
```
<system-reminder>
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits, run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received (for example, to make edits). Instead, you should:

1. Answer the user's query comprehensively
2. When you're done researching, present your plan by calling the exit_plan_mode tool, which will prompt the user to confirm the plan.
</system-reminder>
```

## 🎯 **时序分析和触发条件**

### 对话序列模式
- **claudeMd**: 几乎每个对话开始时都会触发，作为系统上下文注入
- **todo_changed**: 在todo状态变化后立即触发
- **todo_empty**: 在todo列表为空时定期提醒
- **plan_mode**: 在用户激活计划模式时持续提醒

### 角色分布特征
- **human消息**: 主要包含claudeMd上下文注入和todo状态更新
- **gpt消息**: 主要包含todo状态提醒和plan模式约束

## 📋 **内容格式分析**

### 通用格式特征
1. **包装标签**: 所有reminder都包装在`<system-reminder>`标签中
2. **隐式指令**: 包含明确的"DO NOT mention"指令
3. **内容结构**: 采用markdown格式，结构化清晰
4. **变量替换**: 支持路径、状态、数据等动态内容

### 固定部分与变量部分
- **固定部分**: 模板文本、指令文本、格式结构
- **变量部分**: 文件路径、todo数据、项目状态等

## 🔧 **行为模式识别**

### 触发事件
1. **新对话轮次**: 触发claudeMd注入
2. **todo状态变化**: 触发todo_changed
3. **todo列表为空**: 触发todo_empty
4. **计划模式激活**: 触发plan_mode

### 生命周期管理
- **实时性**: 状态变化立即触发对应reminder
- **持续性**: 某些reminder在特定状态下持续出现
- **隐式性**: 用户不可见，仅影响AI行为

## 📝 **具体案例提取**

### claudeMd案例
```
<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
Codebase and user instructions are shown below...
Contents of /Users/baicai/Desktop/Claude_code/lastkode-feature-hooks/CLAUDE.md (project instructions, checked into the codebase):
[完整的CLAUDE.md内容]
</system-reminder>
```

### todo_changed案例
```
<system-reminder>
Your todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your todo list:

[{"content":"Research MCP and hooks support comprehensively","status":"completed","priority":"high","id":"research-mcp-hooks"}]
</system-reminder>
```

### todo_empty案例
```
<system-reminder>
This is a reminder that your todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a todo list please use the TodoWrite tool to create one.
</system-reminder>
```

### plan_mode案例
```
<system-reminder>
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits, run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system.
</system-reminder>
```

## 🚀 **实现指南**

### 核心实现要点
1. **事件驱动架构**: 使用事件监听器监控状态变化
2. **模板化系统**: 实现可配置的reminder模板
3. **角色分配**: 根据触发条件决定在哪个角色中注入
4. **隐式注入**: 确保用户不可见，仅影响AI行为

### 集成建议
1. **工具调用钩子**: 在工具调用前后注入相关reminder
2. **状态变化监听**: 监听todo、plan等状态变化
3. **上下文管理**: 在新对话轮次注入项目上下文
4. **错误处理**: 处理reminder注入失败的情况

### 技术实现
- **存储**: 使用JSON存储系统状态
- **触发**: 基于事件驱动的触发机制
- **模板**: 支持变量替换的模板系统
- **验证**: 确保reminder格式正确性

## 📊 **总结**

System-reminder是Claude Code的核心机制，实现了：
- **智能上下文注入**: 自动注入项目特定指导
- **状态同步**: 实时反映系统状态变化
- **行为约束**: 通过隐式提醒控制AI行为
- **无感知体验**: 用户不可见的智能助手行为调控

这个机制是Claude Code实现高度个性化和项目适应性的关键技术，值得在类似系统中借鉴和实现。