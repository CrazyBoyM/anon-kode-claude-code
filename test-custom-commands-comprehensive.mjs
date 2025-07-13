#!/usr/bin/env node

// Test script for custom commands functionality
import { existsSync, readFileSync } from 'fs'

console.log('🧪 Testing Custom Commands Implementation')
console.log('=' .repeat(50))

// Test 1: Check if .claude/commands directory exists
console.log('\n1. Directory Structure Check:')
const testDirs = [
  '.claude/commands',
  '.claude/commands/test'
]

testDirs.forEach(dir => {
  console.log(`   ${dir}: ${existsSync(dir) ? '✅ EXISTS' : '❌ MISSING'}`)
})

// Test 2: Test files exist
console.log('\n2. Test Command Files Check:')
const testFiles = [
  '.claude/commands/test/git-commit.md',
  '.claude/commands/code-review.md'
]

testFiles.forEach(file => {
  if (existsSync(file)) {
    console.log(`   ✅ ${file}`)
    try {
      const content = readFileSync(file, 'utf-8')
      console.log(`      📝 Content length: ${content.length} chars`)
      
      // Check for key features
      const features = {
        'YAML frontmatter': content.includes('---'),
        '$ARGUMENTS placeholder': content.includes('$ARGUMENTS'),
        'Bash commands (!)': content.includes('!`'),
        'File references (@)': content.includes('@'),
        'allowed-tools': content.includes('allowed-tools')
      }
      
      Object.entries(features).forEach(([feature, present]) => {
        console.log(`      ${present ? '✅' : '❌'} ${feature}`)
      })
    } catch (error) {
      console.log(`      ❌ Error reading file: ${error.message}`)
    }
  } else {
    console.log(`   ❌ ${file} - NOT FOUND`)
  }
})

// Test 3: Check implementation file
console.log('\n3. Implementation File Check:')
const implFile = 'src/services/customCommands.ts'
if (existsSync(implFile)) {
  console.log(`   ✅ ${implFile}`)
  const content = readFileSync(implFile, 'utf-8')
  
  const features = {
    'executeBashCommands function': content.includes('executeBashCommands'),
    'resolveFileReferences function': content.includes('resolveFileReferences'),
    'validateAllowedTools function': content.includes('validateAllowedTools'),
    '$ARGUMENTS support': content.includes('$ARGUMENTS'),
    'allowed-tools property': content.includes('allowed-tools'),
    'namespace support': content.includes('namespace')
  }
  
  Object.entries(features).forEach(([feature, present]) => {
    console.log(`      ${present ? '✅' : '❌'} ${feature}`)
  })
} else {
  console.log(`   ❌ ${implFile} - NOT FOUND`)
}

console.log('\n' + '=' .repeat(50))
console.log('🎉 Static analysis completed!')