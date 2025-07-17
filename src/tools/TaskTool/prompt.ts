import { type Tool } from '../../Tool'
import { getTools, getReadOnlyTools } from '../../tools'
import { TaskTool } from './TaskTool'
import { BashTool } from '../BashTool/BashTool'
import { FileWriteTool } from '../FileWriteTool/FileWriteTool'
import { FileEditTool } from '../FileEditTool/FileEditTool'
import { NotebookEditTool } from '../NotebookEditTool/NotebookEditTool'
import { GlobTool } from '../GlobTool/GlobTool'
import { FileReadTool } from '../FileReadTool/FileReadTool'

export async function getTaskTools(
  dangerouslySkipPermissions: boolean,
): Promise<Tool[]> {
  // No recursive tasks, yet..
  return (
    await (dangerouslySkipPermissions ? getTools() : getReadOnlyTools())
  ).filter(_ => _.name !== TaskTool.name)
}

export async function getPrompt(
  dangerouslySkipPermissions: boolean,
): Promise<string> {
  const tools = await getTaskTools(dangerouslySkipPermissions)
  const toolNames = tools.map(_ => _.name).join(', ')
  return `Launch a new agent that has access to the following tools: ${toolNames}. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use the Task tool to perform the search for you.

When to use the Task tool:
- If you are searching for a keyword like "config" or "logger", or for questions like "which file does X?", the Task tool is strongly recommended

When NOT to use the Task tool:
- If you want to read a specific file path, use the ${FileReadTool.name} or ${GlobTool.name} tool instead of the Task tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the ${GlobTool.name} tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the Read tool instead of the Task tool, to find the match more quickly
- Writing code and running bash commands (use other tools for that)
- Other tasks that are not related to searching for a keyword or file

Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent`
}
