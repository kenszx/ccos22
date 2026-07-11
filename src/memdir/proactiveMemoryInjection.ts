/**
 * CCOS Proactive Memory Injection — P0 Enhancement
 *
 * Injects relevant memories before every user turn, rather than
 * waiting for the LLM to request them via side-query. This ensures
 * the Agent always has context from past conversations.
 *
 * Works alongside the existing findRelevantMemories/sideQuery path.
 * This module adds a pre-query hook that enriches user messages with
 * memory context before they reach the LLM.
 */

import { logForDebugging } from '../utils/debug.js'
import {
  findRelevantMemories,
  type RelevantMemory,
} from './findRelevantMemories.js'
import { memoryAge, memoryFreshnessText } from './memoryAge.js'
import {
  getAutoMemPath,
  isAutoMemoryEnabled,
} from './paths.js'
import { scanMemoryFiles } from './memoryScan.js'
import { readFileSync } from 'fs'

/** Maximum memories to inject per turn (prevents context bloat). */
const MAX_INJECTED_MEMORIES = 5
/** Maximum total characters from injected memories. */
const MAX_INJECTED_CHARS = 3000
/** How often to refresh the memory file list (ms). */
const SCAN_COOLDOWN_MS = 30_000

// Module-level scan cache
let lastScanTime = 0
let lastScanResult: RelevantMemory[] = []
let lastQuery = ''

/**
 * Get relevant memories for a user query, with scan cooldown to
 * avoid excessive file I/O on rapid consecutive messages.
 */
export async function getProactiveMemories(
  query: string,
  signal: AbortSignal,
): Promise<Array<{ path: string; content: string; ageText: string }>> {
  if (!isAutoMemoryEnabled()) return []

  const now = Date.now()
  const memoryDir = getAutoMemPath()

  // Use cached scan if within cooldown and same query
  let selected: RelevantMemory[]
  if (now - lastScanTime < SCAN_COOLDOWN_MS && lastQuery === query) {
    selected = lastScanResult
  } else {
    try {
      selected = await findRelevantMemories(query, memoryDir, signal)
      lastScanTime = now
      lastScanResult = selected
      lastQuery = query
    } catch (err) {
      logForDebugging(`[CCOS] proactiveMemory scan failed: ${err}`)
      return []
    }
  }

  if (selected.length === 0) return []

  const results: Array<{ path: string; content: string; ageText: string }> = []

  for (const mem of selected.slice(0, MAX_INJECTED_MEMORIES)) {
    try {
      const content = readFileSync(mem.path, 'utf-8')
      // Extract frontmatter body (skip --- metadata ---)
      const body = extractMemoryBody(content)
      if (!body.trim()) continue

      const age = memoryAge(mem.mtimeMs)
      const ageText = memoryFreshnessText(age)

      results.push({
        path: mem.path,
        content: truncateContent(body),
        ageText,
      })

      // Stop if total content exceeds limit
      const totalChars = results.reduce((sum, r) => sum + r.content.length, 0)
      if (totalChars > MAX_INJECTED_CHARS) break
    } catch {
      // Skip unreadable memory files
    }
  }

  if (results.length > 0) {
    logForDebugging(
      `[CCOS] proactiveMemory injected ${results.length} memories (${results.reduce((s, r) => s + r.content.length, 0)} chars)`,
    )
  }

  return results
}

/**
 * Format injected memories as a system reminder block.
 */
export function formatProactiveMemories(
  memories: Array<{ path: string; content: string; ageText: string }>,
): string {
  if (memories.length === 0) return ''

  const lines = ['<system-reminder>']
  lines.push('The following memories from past conversations may be relevant:')
  lines.push('')

  for (const mem of memories) {
    const filename = mem.path.split(/[/\\]/).pop()?.replace('.md', '') ?? mem.path
    lines.push(`## ${filename} ${mem.ageText}`)
    lines.push(mem.content.trim())
    lines.push('')
  }

  lines.push('Use these memories to inform your response if applicable.')
  lines.push('</system-reminder>')
  return lines.join('\n')
}

/** Extract body content from a memory markdown file (skip YAML frontmatter). */
function extractMemoryBody(content: string): string {
  // Skip YAML frontmatter (--- ... ---)
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3)
    if (endIdx !== -1) {
      return content.slice(endIdx + 3).trim()
    }
  }
  return content
}

/** Truncate content to keep injection size manageable. */
function truncateContent(content: string): string {
  if (content.length <= 800) return content
  return content.slice(0, 800) + '\n... (truncated)'
}
