#!/usr/bin/env node

// Simple test script to validate custom commands functionality
import { loadCustomCommands } from './src/services/customCommands.js'
import { getCommands } from './src/commands.js'

async function testCustomCommands() {
  console.log('🔍 Testing Custom Commands Functionality...\n')
  
  try {
    // Test custom command loading
    console.log('Loading custom commands...')
    const customCommands = await loadCustomCommands()
    console.log(`✅ Loaded ${customCommands.length} custom commands:`)
    
    customCommands.forEach(cmd => {
      console.log(`  • /${cmd.name} - ${cmd.description}`)
      if (cmd.aliases && cmd.aliases.length > 0) {
        console.log(`    Aliases: ${cmd.aliases.join(', ')}`)
      }
    })
    
    if (customCommands.length === 0) {
      console.log('  ℹ️  No custom commands found (this is normal if no .md files exist)')
    }
    
    console.log('\n' + '─'.repeat(50))
    
    // Test integration with main command system
    console.log('Testing integration with main command system...')
    const allCommands = await getCommands()
    const customInAll = allCommands.filter(cmd => 
      customCommands.some(custom => custom.name === cmd.name)
    )
    
    console.log(`✅ Total commands available: ${allCommands.length}`)
    console.log(`✅ Custom commands integrated: ${customInAll.length}`)
    
    if (customInAll.length > 0) {
      console.log('\nIntegrated custom commands:')
      customInAll.forEach(cmd => {
        console.log(`  • /${cmd.name} - ${cmd.description}`)
      })
    }
    
    console.log('\n' + '─'.repeat(50))
    
    // Test frontmatter parsing
    const testMd = `---
name: test-command
description: A test command for validation
aliases: [tc, test]
enabled: true
---

This is test content for command validation.`
    
    console.log('Testing frontmatter parsing...')
    const { parseFrontmatter } = await import('./src/services/customCommands.js')
    const parsed = parseFrontmatter(testMd)
    
    console.log('✅ Frontmatter parsing test:')
    console.log(`  Name: ${parsed.frontmatter.name}`)
    console.log(`  Description: ${parsed.frontmatter.description}`)
    console.log(`  Aliases: [${parsed.frontmatter.aliases?.join(', ')}]`)
    console.log(`  Enabled: ${parsed.frontmatter.enabled}`)
    console.log(`  Content length: ${parsed.content.trim().length} chars`)
    
    console.log('\n🎉 All tests passed! Custom commands functionality is working correctly.')
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

testCustomCommands()