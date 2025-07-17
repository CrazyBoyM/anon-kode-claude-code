# 命令使用指南

本指南介绍 last-kode 中的高级开发工作流命令，帮助您更高效地管理项目开发。

## 命令概览

### 检查点系统
- **`/checkpoint-save`** - 智能保存项目状态
- **`/checkpoint-restore`** - 智能恢复到指定版本

### Worktree 工作流
- **`/worktree-create`** - 创建功能开发环境
- **`/worktree-review`** - 自我审查开发成果
- **`/worktree-merge`** - 直接合并到主分支
- **`/worktree-pr`** - 创建 GitHub PR

## 快速开始

### 基础工作流

#### 选项1：直接合并流程
```bash
# 1. 保存当前状态
/checkpoint-save

# 2. 开始新功能开发
/worktree-create user-authentication

# 3. 在新环境中开发...
cd ../$(basename $(pwd))-user-authentication

# 4. 开发完成后审查
/worktree-review user-authentication

# 5. 直接合并到主分支
/worktree-merge user-authentication

# 6. 保存里程碑
/checkpoint-save
```

#### 选项2：PR 协作流程
```bash
# 1. 保存当前状态
/checkpoint-save

# 2. 开始新功能开发
/worktree-create user-authentication

# 3. 在新环境中开发...
cd ../$(basename $(pwd))-user-authentication

# 4. 开发完成后审查
/worktree-review user-authentication

# 5. 创建 GitHub PR
/worktree-pr user-authentication

# 6. 团队审查并合并后保存里程碑
/checkpoint-save
```

## 详细使用指南

### 检查点系统详细指南

检查点系统提供智能的项目状态管理。[查看完整文档](./checkpoint.md)

#### 保存检查点
```bash
/checkpoint-save
```
- 自动分析当前变更
- 生成智能提交信息
- 创建项目状态快照
- 评估代码质量

#### 恢复检查点
```bash
# 交互式恢复（推荐）
/checkpoint-restore

# 自然语言恢复
/checkpoint-restore "认证功能之前的版本"
/checkpoint-restore "昨天的稳定版本"

# 关键词恢复
/checkpoint-restore stable
/checkpoint-restore latest
```

### Worktree 系统详细指南

Worktree 系统提供隔离的功能开发环境。[查看完整文档](./worktree.md)

#### 创建 Worktree
```bash
/worktree-create [feature-name]
```
- 交互式任务规划
- 自动创建分支和工作目录
- 生成结构化任务文件

#### 审查开发成果
```bash
/worktree-review [feature-name]
```
- 任务完成度检查
- 代码质量评估
- 架构一致性分析
- 综合评分报告

#### 合并到主分支
```bash
/worktree-merge [feature-name]
```
- 预合并质量检查
- 自动处理未提交更改
- 安全合并和清理

## 工作流模式

### 模式1：快速功能开发

适合小型功能和快速迭代：

```bash
# 1. 创建功能分支
/worktree-create quick-fix

# 2. 快速开发和测试
# (在 ../$(basename $(pwd))-quick-fix 中工作)

# 3. 完成后直接合并
/worktree-merge quick-fix
```

### 模式2：大型功能开发

适合复杂功能和长期开发：

```bash
# 1. 保存起始点
/checkpoint-save

# 2. 创建功能分支
/worktree-create complex-feature

# 3. 阶段性审查
/worktree-review complex-feature

# 4. 继续开发...

# 5. 最终审查和合并
/worktree-review complex-feature
/worktree-merge complex-feature

# 6. 创建里程碑
/checkpoint-save
```

### 模式3：实验性开发

适合尝试新技术和重构：

```bash
# 1. 创建实验检查点
/checkpoint-save

# 2. 实验性worktree
/worktree-create experimental-refactor

# 3. 实验开发...

# 4. 评估实验结果
/worktree-review experimental-refactor

# 5a. 实验成功 - 合并
/worktree-merge experimental-refactor

# 5b. 实验失败 - 恢复
/checkpoint-restore "实验前"
```

### 模式4：并行开发

适合多功能同时开发：

```bash
# 1. 创建多个worktree
/worktree-create feature-a
/worktree-create feature-b
/worktree-create feature-c

# 2. 在不同目录中并行开发
# Terminal 1: cd ../$(basename $(pwd))-feature-a
# Terminal 2: cd ../$(basename $(pwd))-feature-b  
# Terminal 3: cd ../$(basename $(pwd))-feature-c

# 3. 分别审查和合并
/worktree-review feature-a && /worktree-merge feature-a
/worktree-review feature-b && /worktree-merge feature-b
/worktree-review feature-c && /worktree-merge feature-c
```

## 集成最佳实践

### 1. 版本控制策略

```bash
# 重要操作前总是创建检查点
/checkpoint-save

# 功能开发使用worktree隔离
/worktree-create new-feature

# 合并前强制审查
/worktree-review new-feature

# 安全合并
/worktree-merge new-feature
```

### 2. 质量保证流程

```bash
# 开发阶段
/worktree-create feature
# (开发...)

# 自我审查阶段
/worktree-review feature
# (修复问题...)

# 再次审查确认
/worktree-review feature

# 通过后合并
/worktree-merge feature
```

### 3. 风险管理

```bash
# 高风险操作前
/checkpoint-save

# 如果需要回滚
/checkpoint-restore "操作前的状态"

# 实验性更改
/worktree-create experiment
# (如果失败直接删除worktree)
```

## 命令参数说明

### Checkpoint 命令

**`/checkpoint-save`**
- 无参数：自动分析并保存
- 自动检测变更类型和生成提交信息

**`/checkpoint-restore`**
- 无参数：交互式恢复
- 自然语言：`"描述要恢复的版本"`
- 关键词：`stable`, `latest`, `milestone`

### Worktree 命令

**`/worktree-create [name]`**
- `name`: 功能名称，将用作分支名和目录名

**`/worktree-review [name-or-path]`**
- `name`: 分支名称
- `path`: worktree路径
- 支持相对路径和绝对路径

**`/worktree-merge [name-or-path]`**
- `name`: 分支名称  
- `path`: worktree路径
- 自动调用review进行预检查

## 故障排除

### 常见问题解决

**检查点相关**：
```bash
# 检查点列表为空
/checkpoint-save  # 创建第一个检查点

# 恢复后出现问题
/checkpoint-restore  # 使用交互式选择更好的版本

# 找不到合适的版本
/checkpoint-restore  # 让AI帮助选择
```

**Worktree相关**：
```bash
# Worktree创建失败
git status  # 检查主分支状态
git branch  # 检查分支名冲突

# 审查不通过
# 返回worktree继续开发，解决问题后重新审查

# 合并失败
# 使用提供的回滚指令，解决冲突后重试
```

### 紧急恢复

**如果操作出现严重问题**：
```bash
# 1. 停止当前操作
Ctrl+C

# 2. 检查当前状态
git status
git log --oneline -5

# 3. 恢复到最近的稳定点
/checkpoint-restore stable

# 4. 或使用交互式恢复
/checkpoint-restore
```

## 高级技巧

### 1. 批量操作

```bash
# 创建多个相关功能的worktree
for feature in auth ui api; do
  /worktree-create $feature
done
```

### 2. 条件合并

```bash
# 只有审查通过才合并
if /worktree-review feature | grep -q "建议合并"; then
  /worktree-merge feature
else
  echo "审查未通过，需要继续开发"
fi
```

### 3. 自动化脚本

```bash
#!/bin/bash
# 完整功能开发流程脚本

FEATURE_NAME=$1

echo "开始功能开发: $FEATURE_NAME"

# 1. 保存起始点
/checkpoint-save

# 2. 创建worktree  
/worktree-create $FEATURE_NAME

echo "请在 ../$(basename $(pwd))-$FEATURE_NAME 中开发功能"
echo "完成后运行: /worktree-review $FEATURE_NAME"
```

## 注意事项

### 重要提醒

1. **数据安全**
   - 重要操作前总是创建检查点
   - 不要忽略审查发现的问题
   - 使用提供的回滚指令

2. **工作流纪律**
   - 遵循任务计划进行开发
   - 合并前必须通过审查
   - 保持工作区整洁

3. **性能考虑**
   - 及时清理不需要的worktree
   - 定期清理旧的检查点
   - 避免过多的并行worktree

### 最佳实践总结

- ✅ 使用检查点保护重要状态
- ✅ 为每个功能创建独立worktree
- ✅ 认真对待代码审查结果
- ✅ 保持清晰的开发目标
- ✅ 及时处理质量问题

- ❌ 不要跳过审查直接合并
- ❌ 不要在主分支直接开发功能
- ❌ 不要忽略安全备份
- ❌ 不要积累过多技术债务

通过合理使用这些命令，您可以建立安全、高效的开发工作流，提高代码质量和开发效率。