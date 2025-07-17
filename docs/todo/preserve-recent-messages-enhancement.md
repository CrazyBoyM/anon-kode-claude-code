# Enhancement: Preserve Recent Messages in Auto-Compact

## Problem Analysis

The current auto-compact implementation only preserves file context through the file recovery mechanism (`selectAndReadFiles()`). While this maintains coding context by recovering recently accessed files, it doesn't preserve the recent conversation flow and immediate context that users may have been working with.

### Current Limitations

1. **Lost Conversation Context**: When auto-compact triggers, all recent user-assistant exchanges are lost except for the compressed summary
2. **Workflow Disruption**: Users lose track of their immediate discussion, questions, and iterative refinements
3. **Context Discontinuity**: The conversation jumps from compressed summary directly to new user input without recent context bridge

## Proposed Enhancement

Preserve the last 10 rounds of conversation messages alongside the existing file recovery mechanism to maintain both coding context and conversation continuity.

### Implementation Approaches

#### Option 1: Simple Recent Messages Preservation
```typescript
// In executeAutoCompact() function
const recentMessages = messages.slice(-20) // Last 10 rounds (user + assistant pairs)
const recentMessagesContent = recentMessages
  .map(msg => `**${msg.type}**: ${typeof msg.content === 'string' ? msg.content : '[complex content]'}`)
  .join('\n\n')

const compactedMessages = [
  createUserMessage('Context automatically compressed due to token limit. Essential information preserved.'),
  summaryResponse,
  createUserMessage(`**Recent Conversation History**\n\n${recentMessagesContent}\n\n*Last 10 rounds preserved for continuity*`),
  // ... existing file recovery messages
]
```

#### Option 2: Intelligent Message Selection
```typescript
// Select messages based on importance and recency
function selectImportantRecentMessages(messages: Message[], maxMessages: number = 10): Message[] {
  const recentMessages = messages.slice(-maxMessages * 2) // Get more than needed
  
  // Prioritize messages with:
  // - Tool usage (code changes, file operations)
  // - Error handling and fixes
  // - User questions and clarifications
  // - Recent completions and status updates
  
  return recentMessages
    .filter(msg => {
      if (msg.type === 'user') return true
      if (msg.type === 'assistant') {
        // Keep assistant messages with tool usage or important content
        return msg.content?.includes('```') || 
               msg.content?.includes('Error') || 
               msg.content?.includes('Success') ||
               msg.content?.includes('Fixed') ||
               msg.content?.includes('Completed')
      }
      return false
    })
    .slice(-maxMessages)
}
```

#### Option 3: Configurable Preservation (Recommended)
```typescript
// Add configuration option for recent message preservation
interface AutoCompactConfig {
  preserveRecentMessages: boolean
  maxRecentMessages: number
  maxRecentMessageTokens: number
}

const DEFAULT_CONFIG: AutoCompactConfig = {
  preserveRecentMessages: true,
  maxRecentMessages: 10,
  maxRecentMessageTokens: 5000
}

async function preserveRecentMessages(messages: Message[], config: AutoCompactConfig): Promise<Message[]> {
  if (!config.preserveRecentMessages) return []
  
  const recentMessages = messages.slice(-config.maxRecentMessages * 2)
  const preservedMessages = []
  let tokenCount = 0
  
  // Work backwards to preserve most recent first
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i]
    const msgTokens = countTokens([msg])
    
    if (tokenCount + msgTokens > config.maxRecentMessageTokens) break
    
    preservedMessages.unshift(msg)
    tokenCount += msgTokens
  }
  
  return preservedMessages
}
```

### Integration Points

1. **Configuration**: Add settings to `src/utils/config.ts` for controlling recent message preservation
2. **Token Budget**: Ensure preserved messages don't exceed token limits (suggest 5,000 token limit)
3. **Message Processing**: Integrate into `executeAutoCompact()` after summary generation but before file recovery
4. **User Experience**: Add clear indicators showing both summary and recent context are preserved

### Benefits

1. **Continuity**: Users can continue conversations more naturally after auto-compact
2. **Context Preservation**: Recent discussion topics and decisions remain accessible
3. **Reduced Repetition**: Users don't need to re-explain recent context or questions
4. **Better UX**: Auto-compact feels less disruptive to active development workflows

### Implementation Plan

1. **Phase 1**: Implement Option 1 (simple preservation) as proof of concept
2. **Phase 2**: Add configuration options and token budget management
3. **Phase 3**: Enhance with intelligent message selection based on content importance
4. **Phase 4**: User testing and refinement based on real-world usage

### Technical Considerations

- **Token Management**: Preserved messages must fit within overall compression budget
- **Message Formatting**: Ensure preserved messages render correctly in terminal UI
- **Performance**: Minimal impact on auto-compact execution time
- **Error Handling**: Graceful fallback if recent message preservation fails

### Configuration Example

```typescript
// In user config
{
  "autoCompact": {
    "preserveRecentMessages": true,
    "maxRecentMessages": 10,
    "maxRecentMessageTokens": 5000
  }
}
```

This enhancement would significantly improve the user experience during auto-compact operations while maintaining the existing benefits of file recovery and conversation summarization.