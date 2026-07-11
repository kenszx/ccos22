/**
 * CCOS PROACTIVE — Autonomous Agent Mode
 *
 * Enables the Agent to work autonomously toward a goal without requiring
 * continuous user interaction. The Agent uses SleepTool for pacing and
 * integrates with GOALS for completion tracking.
 *
 * Activated via `/proactive` or programmatically when DAEMON fires a cron task.
 */

import { logForDebugging } from '../utils/debug.js'

// Module-level state
let proactiveActive = false
let proactiveGoal: string | null = null
let proactiveStartTime: number | null = null
let nextTickAt: number | null = null  // Next proactive tick timestamp

// Subscribers notified on proactive state changes
const subscribers = new Set<() => void>()

function notifySubscribers(): void {
  for (const fn of subscribers) {
    try { fn() } catch { /* swallow */ }
  }
}

/**
 * Subscribe to proactive state changes.
 * Returns an unsubscribe function. Compatible with React's useSyncExternalStore.
 */
export function subscribeToProactiveChanges(callback: () => void): () => void {
  subscribers.add(callback)
  return () => { subscribers.delete(callback) }
}

/**
 * Get the next proactive tick timestamp (epoch ms), or null if not in proactive mode.
 * Used by the UI to show countdown to next autonomous action.
 */
export function getNextTickAt(): number | null {
  if (!proactiveActive) return null
  return nextTickAt
}

/**
 * Set the next tick time for the proactive loop.
 * Called by the agent loop to schedule its next autonomous action.
 */
export function scheduleNextTick(delayMs: number = 5000): void {
  nextTickAt = Date.now() + delayMs
  notifySubscribers()
}

/** Check if proactive autonomous mode is currently active. */
export function isProactiveActive(): boolean {
  return proactiveActive
}

/** Get the current proactive goal, if any. */
export function getProactiveGoal(): string | null {
  return proactiveGoal
}

/** Get the elapsed time since proactive mode was activated (ms). */
export function getProactiveElapsedMs(): number | null {
  if (proactiveStartTime === null) return null
  return Date.now() - proactiveStartTime
}

/** Activate proactive autonomous mode with an optional goal. */
export function activateProactive(goal?: string): void {
  proactiveActive = true
  proactiveGoal = goal ?? null
  proactiveStartTime = Date.now()
  scheduleNextTick(0)  // trigger first tick immediately
  logForDebugging(
    `[CCOS] Proactive mode activated` +
    (goal ? ` with goal: "${goal}"` : ''),
  )
}

/** Deactivate proactive autonomous mode. */
export function deactivateProactive(): void {
  if (proactiveActive) {
    logForDebugging(
      `[CCOS] Proactive mode deactivated` +
      (proactiveStartTime ? ` after ${Date.now() - proactiveStartTime}ms` : ''),
    )
  }
  proactiveActive = false
  proactiveGoal = null
  proactiveStartTime = null
  nextTickAt = null
  notifySubscribers()
}

/**
 * Brief proactive section injected into the system prompt when proactive
 * mode is active. Gives the Agent instructions for autonomous operation.
 */
export const BRIEF_PROACTIVE_SECTION = `
## Autonomous Mode (PROACTIVE)

You are operating in autonomous mode. Key rules:

1. **Self-pacing**: Use SleepTool to control your own pace. After completing a task, sleep briefly before continuing. Avoid rapid-fire actions.
2. **Goal persistence**: Keep working toward your goal until complete, even across multiple turns. Check progress with GOALS periodically.
3. **Autonomy threshold**: Prefer taking action over asking questions. Only ask the user when:
   - The decision is irreversible (merging code, publishing, deleting data)
   - You genuinely don't have enough context to proceed
   - You've exhausted reasonable alternatives
4. **Progress reporting**: After each major milestone, briefly report progress so the user knows you're still working.
5. **Error recovery**: If a tool fails, try an alternative approach before giving up. Log the error but don't stop the whole task.
`

/**
 * Full proactive section with goal context, appended when a specific goal is set.
 */
export function getProactiveSection(): string {
  const goal = getProactiveGoal()
  if (!goal) return BRIEF_PROACTIVE_SECTION

  const elapsed = getProactiveElapsedMs()
  const elapsedStr = elapsed !== null
    ? ` (${Math.floor(elapsed / 1000 / 60)}m elapsed)`
    : ''

  return `${BRIEF_PROACTIVE_SECTION}

## Current Goal${elapsedStr}
**Goal**: ${goal}

You are currently working toward this goal autonomously. Continue making progress each turn. Check completion status periodically.`
}
