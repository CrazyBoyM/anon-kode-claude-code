import { parseFrontmatter, loadCustomCommands } from '../src/services/customCommands'
import { describe, expect, test } from '@jest/globals'

describe('Custom Commands', () => {
  describe('parseFrontmatter', () => {
    test('should parse YAML frontmatter correctly', () => {
      const content = `---
name: test-command
description: A test command
aliases: [tc, test]
enabled: true
hidden: false
---

This is the command content.`

      const result = parseFrontmatter(content)
      
      expect(result.frontmatter.name).toBe('test-command')
      expect(result.frontmatter.description).toBe('A test command')
      expect(result.frontmatter.aliases).toEqual(['tc', 'test'])
      expect(result.frontmatter.enabled).toBe(true)
      expect(result.frontmatter.hidden).toBe(false)
      expect(result.content.trim()).toBe('This is the command content.')
    })

    test('should handle missing frontmatter', () => {
      const content = 'Just some content without frontmatter.'
      const result = parseFrontmatter(content)
      
      expect(result.frontmatter).toEqual({})
      expect(result.content).toBe(content)
    })

    test('should handle multi-line arrays', () => {
      const content = `---
name: multi-array
aliases:
  - alias1
  - alias2
  - alias3
---

Content here.`

      const result = parseFrontmatter(content)
      expect(result.frontmatter.aliases).toEqual(['alias1', 'alias2', 'alias3'])
    })

    test('should handle inline arrays', () => {
      const content = `---
name: inline-array
aliases: [a1, a2, a3]
argNames: ["env", "version"]
---

Content here.`

      const result = parseFrontmatter(content)
      expect(result.frontmatter.aliases).toEqual(['a1', 'a2', 'a3'])
      expect(result.frontmatter.argNames).toEqual(['env', 'version'])
    })

    test('should handle boolean values', () => {
      const content = `---
enabled: true
hidden: false
---

Content`

      const result = parseFrontmatter(content)
      expect(result.frontmatter.enabled).toBe(true)
      expect(result.frontmatter.hidden).toBe(false)
    })
  })
})