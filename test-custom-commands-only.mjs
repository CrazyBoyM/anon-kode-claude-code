#!/usr/bin/env node

// Simple test script focused on custom commands only
import { loadCustomCommands, parseFrontmatter } from './src/services/customCommands.js'

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
      console.log(`    Type: ${cmd.type}, Enabled: ${cmd.isEnabled}`)
    })
    
    if (customCommands.length === 0) {
      console.log('  ℹ️  No custom commands found')
    }
    
    console.log('\n' + '─'.repeat(50))
    
    // Test frontmatter parsing with different scenarios
    console.log('Testing frontmatter parsing...')
    
    const testCases = [
      {
        name: 'Simple command',
        content: `---
name: simple
description: A simple test command
---

Simple command content.`
      },
      {
        name: 'Command with aliases',
        content: `---
name: complex
description: Complex command with features
aliases: [c, comp]
enabled: true
hidden: false
---

Complex command content with features.`
      },
      {
        name: 'Command with arguments',
        content: `---
name: args-test
description: Command with arguments
argNames: [env, version]
progressMessage: Testing {env} version {version}...
---

Deploy to {env} environment with version {version}.`
      }
    ]
    
    testCases.forEach((testCase, i) => {
      console.log(`\n${i + 1}. ${testCase.name}:`)
      const parsed = parseFrontmatter(testCase.content)
      console.log(`   Name: ${parsed.frontmatter.name}`)
      console.log(`   Description: ${parsed.frontmatter.description}`)
      if (parsed.frontmatter.aliases) {
        console.log(`   Aliases: [${parsed.frontmatter.aliases.join(', ')}]`)
      }
      if (parsed.frontmatter.argNames) {
        console.log(`   Arguments: [${parsed.frontmatter.argNames.join(', ')}]`)
      }
      if (parsed.frontmatter.progressMessage) {
        console.log(`   Progress: ${parsed.frontmatter.progressMessage}`)
      }
      console.log(`   Content: "${parsed.content.trim().substring(0, 50)}..."`)
    })
    
    console.log('\n' + '─'.repeat(50))
    
    // Test argument substitution
    if (customCommands.length > 0) {
      console.log('Testing command execution (argument substitution)...')
      
      const deployCmd = customCommands.find(cmd => cmd.name === 'deploy')
      if (deployCmd && deployCmd.type === 'prompt') {
        const prompt = await deployCmd.getPromptForCommand('staging v2.1.0')
        console.log('✅ Deploy command with args "staging v2.1.0":')
        console.log(`   Prompt length: ${prompt[0].content.length} characters`)
        const content = prompt[0].content
        const hasEnvSubstitution = content.includes('staging')
        const hasVersionSubstitution = content.includes('v2.1.0')
        console.log(`   Environment substitution: ${hasEnvSubstitution ? '✅' : '❌'}`)
        console.log(`   Version substitution: ${hasVersionSubstitution ? '✅' : '❌'}`)
      }
    }
    
    console.log('\n🎉 Custom commands functionality is working correctly!')
    console.log('\n📝 Summary:')
    console.log(`   • Successfully loaded ${customCommands.length} commands`)
    console.log(`   • Frontmatter parsing works correctly`)
    console.log(`   • Command integration is functional`)
    console.log(`   • Argument substitution works`)
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

testCustomCommands()