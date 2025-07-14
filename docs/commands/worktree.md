# Worktree 工作流系统

Worktree 系统是 last-kode 的隔离开发环境管理功能，基于 Git worktree 提供任务驱动的开发流程。

## 概述

Worktree 系统让你可以：
- 为每个功能创建独立的开发环境
- 在不影响主分支的情况下进行实验
- 并行开发多个功能
- 安全地测试和验证代码更改

## 核心理念

### 任务驱动开发
每个 worktree 都有明确的开发目标和任务计划，确保：
- 开发目标清晰
- 作用域控制得当
- 质量标准一致
- 集成过程安全

### 三阶段工作流
1. **Create**: 创建带有任务规划的 worktree
2. **Review**: 自我审查开发成果
3. **Merge**: 安全集成回主分支

## 核心命令

### `/worktree-create` - 创建工作树

创建新的 worktree 并进行交互式任务规划。

**功能特性**：
- 🎯 **交互式规划**：详细讨论开发目标和需求
- 📋 **任务文档化**：生成结构化的任务文件
- 🌿 **分支管理**：自动创建功能分支
- 📁 **环境隔离**：独立的工作目录

**使用方法**：
```bash
/worktree-create [feature-name]
```

**规划对话示例**：
```
🎯 功能规划对话
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

功能名称: user-auth

我需要了解一些信息来创建详细的开发计划：

1. 这个功能的主要目标是什么？
   - 用户注册和登录
   - JWT 令牌管理
   - 权限控制

2. 需要涉及哪些文件和组件？
   - 新建: src/auth/, components/Login.tsx
   - 修改: src/App.tsx, src/types/

3. 有什么特殊的约束或要求？
   - 安全性要求高
   - 需要支持社交登录
   - 性能要求：登录响应 < 1s

基于您的回答，我将生成详细的任务计划...
```

**生成的任务文件**：
```markdown
# Worktree Task: user-auth

## 开发目标
实现完整的用户认证系统，包括注册、登录、JWT管理和权限控制。

## 成功标准
- [x] 用户可以成功注册新账户
- [x] 用户可以使用邮箱/密码登录
- [x] JWT令牌正确生成和验证
- [x] 登录状态在页面刷新后保持
- [x] 支持安全登出功能

## 实现计划
### 文件创建/修改
- `src/auth/AuthService.ts` - 认证服务核心逻辑
- `src/auth/tokenManager.ts` - JWT令牌管理
- `src/components/Login.tsx` - 登录界面组件
- `src/components/Register.tsx` - 注册界面组件
- `src/types/User.ts` - 用户类型定义

### 关键需求
- 安全密码哈希处理
- 令牌过期和刷新机制
- 输入验证和错误处理
- 响应式UI设计

## 完成定义
- [x] 所有功能按需求实现
- [x] 无破坏性更改
- [x] 代码符合项目规范
- [x] 所有边界情况处理完毕
- [x] 准备好集成到主分支

创建时间: 2025-07-14T14:30:22Z
预期完成: 2-3天
```

### `/worktree-review` - 自我审查

基于任务计划对开发成果进行全面自我审查。

**功能特性**：
- 📋 **任务对比**：检查实际完成与计划的对比
- 🔍 **代码质量审查**：深度技术评估
- 🏗️ **架构分析**：一致性和设计原则检查
- 📊 **评分系统**：客观的质量评分

**使用方法**：
```bash
/worktree-review [branch-name-or-path]
```

**审查报告示例**：
```
🔍 WORKTREE 自我审查报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 任务完成状态
原始目标: 实现用户认证系统
✅ 已完成: 注册/登录功能、JWT管理、权限控制
❌ 未完成: 社交登录集成
⚠️ 作用域变更: 添加了密码重置功能

🐛 代码质量评估
- 错误检测: 🟢 无明显问题
- 实现完整性: 🟡 核心功能完整，部分边界情况待处理
- 架构设计: 🟢 符合现有模式
- 集成影响: 🟢 无破坏性更改

🏗️ 深度架构分析
- 结构一致性: 90/100 - 遵循现有项目结构
- 设计哲学: 85/100 - 符合SOLID原则
- 代码风格: 95/100 - 风格统一，命名规范
- 全局标准: 88/100 - 错误处理统一
- 最小化原则: 82/100 - 少量过度抽象
- 系统演进: 90/100 - 支持未来扩展

📊 综合评分
┌─ 架构健康度: 88/100
├─ 代码质量度: 92/100  
├─ 任务完成度: 85/100
└─ 整体置信度: 88/100

🚨 需要关注的问题
• 社交登录功能未实现 - 建议单独任务处理
• 密码重置功能需要额外测试

📝 合并建议
- 整体质量: 🟢 建议合并
- 置信度: 高
- 阻塞问题: 无
```

### `/worktree-merge` - 安全集成

安全地将 worktree 的工作集成回主分支。

**功能特性**：
- 🔍 **预合并审查**：调用 worktree-review 进行质量检查
- 🛡️ **零数据丢失**：自动保存所有未提交更改
- 🔄 **智能合并**：安全的分支合并流程
- 🧹 **自动清理**：合并后清理 worktree 和分支

**使用方法**：
```bash
/worktree-merge [branch-name-or-path]
```

**合并流程**：
1. **预合并检查**：运行完整的 worktree-review
2. **未提交更改处理**：自动提交保护数据
3. **安全合并**：创建备份后执行合并
4. **清理工作**：删除 worktree、分支和任务文件

**合并报告示例**：
```
🔄 WORKTREE 合并报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 任务完成摘要
原始目标: 实现用户认证系统
✅ 整体成功率: 85% (5/6项任务完成)
📊 质量评分: 88/100

🔍 预合并审查结果
- 代码质量: 🟢 优秀
- 架构一致性: 🟢 良好
- 集成安全性: 🟢 无风险
- 合并建议: ✅ 建议合并

📝 未提交更改处理
- 状态: ✅ 已自动提交
- 提交信息: "完成用户认证功能开发"
- 影响文件: 8个文件

🔄 合并执行
- 安全备份: backup-before-merge-user-auth-1721903022
- 合并状态: ✅ 成功
- 目标分支: main
- 合并提交: merge-abc123d

🧹 清理操作
- ✅ 任务文件已删除
- ✅ Worktree已移除  
- ✅ 功能分支已删除
- ✅ 已切换回main分支

💡 后续建议
- 社交登录功能建议创建新的worktree单独开发
- 验证认证功能在主分支中正常工作
- 考虑添加单元测试覆盖

✅ 合并操作完成 | 回滚指令: git reset backup-before-merge-user-auth-1721903022
```

## Worktree 生命周期

```mermaid
graph TD
    A[/worktree-create feature] --> B[交互式任务规划]
    B --> C[生成任务文件]
    C --> D[创建worktree和分支]
    D --> E[功能开发]
    E --> F[/worktree-review]
    F --> G{质量检查}
    G -->|通过| H[/worktree-merge]
    G -->|问题| I[继续开发]
    I --> E
    H --> J[安全合并]
    J --> K[自动清理]
    K --> L[回到主分支]
```

## 目录结构

Worktree 系统创建的目录结构：

```
project-root/
├── main-project/           # 主项目目录
└── worktrees/             # worktree目录
    ├── lastkode-user-auth/     # 功能开发worktree
    │   ├── worktree_tasks_todo.md  # 任务计划文件
    │   └── ...                # 项目文件副本
    └── lastkode-theme-system/
        ├── worktree_tasks_todo.md
        └── ...
```

## 与检查点系统的集成

Worktree 系统与检查点系统完美协作：

### 开发保护流程
```bash
# 1. 重要操作前创建检查点
/checkpoint-save

# 2. 创建功能开发worktree
/worktree-create new-feature

# 3. 在worktree中开发...

# 4. 审查开发成果
/worktree-review new-feature

# 5. 安全合并回主分支
/worktree-merge new-feature

# 6. 创建里程碑检查点
/checkpoint-save
```

### 实验性开发
```bash
# 1. 创建实验性检查点
/checkpoint-save

# 2. 在worktree中实验
/worktree-create experimental-refactor

# 3. 如果实验失败
/checkpoint-restore "实验前的版本"

# 4. 如果实验成功
/worktree-merge experimental-refactor
```

## 安全特性

### 数据保护
- **任务文件保护**：确保开发计划不丢失
- **未提交更改保护**：自动提交防止数据丢失
- **备份机制**：合并前创建安全备份点

### 质量保证
- **强制审查**：合并前必须通过质量检查
- **架构一致性**：确保符合项目标准
- **作用域控制**：防止无关更改混入

### 回滚能力
- **完整回滚**：提供详细的恢复指令
- **分步回滚**：可以回滚到流程中的任意步骤
- **状态恢复**：恢复到操作前的完整状态

## 最佳实践

### 任务规划
1. **明确目标**：详细描述要实现的功能
2. **定义成功标准**：可测量的完成指标
3. **评估影响范围**：识别需要修改的文件
4. **考虑约束条件**：性能、安全、兼容性要求

### 开发过程
1. **遵循计划**：按照任务文件执行开发
2. **及时提交**：保持合理的提交粒度
3. **文档更新**：同步更新相关文档
4. **测试验证**：确保功能正确实现

### 质量控制
1. **主动审查**：开发完成后立即进行自审
2. **解决问题**：认真处理审查发现的问题
3. **确认质量**：达到合并标准后再执行合并
4. **验证集成**：合并后验证功能正常

## 故障排除

### 常见问题

**Q: worktree 创建失败**
A: 检查是否存在同名分支，或者主分支是否有未提交更改。

**Q: 审查发现严重问题**
A: 不要强制合并，返回开发阶段解决问题后重新审查。

**Q: 合并后出现冲突**
A: 使用提供的回滚指令，解决冲突后重新尝试合并。

**Q: 任务文件丢失**
A: 任务文件在 worktree 目录中，检查是否误删或移动了目录。

### 恢复策略

**意外删除 worktree**：
```bash
# 1. 检查分支是否还存在
git branch -a

# 2. 重新创建worktree
git worktree add ../lastkode-feature feature-branch

# 3. 恢复任务文件（如果有备份）
```

**合并出现问题**：
```bash
# 使用提供的回滚指令
git reset backup-before-merge-feature-123456

# 或者恢复到最近的检查点
/checkpoint-restore "合并前的状态"
```

## 高级用法

### 并行开发
```bash
# 同时开发多个功能
/worktree-create auth-system
/worktree-create ui-theme
/worktree-create api-optimization

# 分别在不同目录中开发
cd ../lastkode-auth-system    # 开发认证
cd ../lastkode-ui-theme       # 开发主题
cd ../lastkode-api-optimization # 优化API
```

### 长期分支管理
```bash
# 对于大型功能，可以多次审查
/worktree-review auth-system  # 中期检查
# 继续开发...
/worktree-review auth-system  # 最终检查
/worktree-merge auth-system   # 合并
```

### 实验性开发
```bash
# 实验性重构
/worktree-create experimental-refactor

# 如果实验成功
/worktree-review experimental-refactor
/worktree-merge experimental-refactor

# 如果实验失败，直接删除worktree
rm -rf ../lastkode-experimental-refactor
git worktree prune
git branch -d experimental-refactor
```

Worktree 系统通过结构化的工作流程，确保每个功能开发都有清晰的目标、严格的质量控制和安全的集成过程，是大型项目开发的理想选择。