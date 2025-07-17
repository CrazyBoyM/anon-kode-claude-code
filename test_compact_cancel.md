# 测试 /compact 命令的 ESC 取消功能

## 修复内容

1. **问题原因**: `/compact` 命令是 local 类型命令，在 `processUserInput` 中直接执行，使用的 `abortController` 没有被注册到 REPL 的 `currentRequest` 中

2. **修复方案**: 
   - 在 PromptInput 组件中，在调用 `processUserInput` 之前就创建 `currentRequest` 
   - 将 `currentRequest` 传递给 `processUserInput` 中的 local 命令
   - 修改 `onQuery` 函数，复用已存在的 `currentRequest` 而不是创建新的

## 测试步骤

1. 启动应用：`pnpm run dev`
2. 输入一些消息建立对话历史
3. 输入 `/compact` 命令
4. 在压缩过程中快速按 ESC 键
5. 验证是否能够正确取消压缩操作

## 预期行为

- 按 ESC 键应该能够立即中止 `/compact` 命令
- 应该显示 "Interrupted by user" 消息
- 不应该出现任何错误信息
- 应该能够继续正常使用其他功能

## 技术细节

- 现在 `useCancelRequest` 可以访问到正确的 `currentRequest.abortController.signal`
- `/compact` 命令使用的 `abortController` 与 REPL 管理的 `currentRequest` 是同一个
- 取消操作的响应应该更加及时和可靠