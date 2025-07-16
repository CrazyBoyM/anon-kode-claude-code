import { Command } from '../commands'
import { reloadCustomCommands } from '../services/customCommands'
import { getCommands } from '../commands'

const refreshCommands = {
  type: 'local',
  name: 'refresh-commands',
  description: 'Reload custom commands from filesystem',
  isEnabled: true,
  isHidden: false,
  async call(_, context) {
    try {
      // Clear custom commands cache
      reloadCustomCommands()
      
      // Clear the main commands cache to force reload
      getCommands.cache.clear?.()
      
      // Reload commands to get updated count
      const commands = await getCommands()
      const customCommands = commands.filter(cmd => 
        cmd.name.startsWith('project:') || cmd.name.startsWith('user:')
      )
      
      return `✅ Commands refreshed successfully!

Custom commands reloaded: ${customCommands.length}
- Project commands: ${customCommands.filter(cmd => cmd.name.startsWith('project:')).length}
- User commands: ${customCommands.filter(cmd => cmd.name.startsWith('user:')).length}

Use /help to see updated command list.`
    } catch (error) {
      console.error('Failed to refresh commands:', error)
      return '❌ Failed to refresh commands. Check console for details.'
    }
  },
  userFacingName() {
    return 'refresh-commands'
  },
} satisfies Command

export default refreshCommands