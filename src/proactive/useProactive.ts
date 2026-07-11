/**
 * CCOS useProactive — React hook for proactive mode UI state.
 *
 * Provides reactive state for the proactive mode toggle in the UI
 * (system tray, status bar, command palette).
 */

import { useEffect, useState } from 'react'
import {
  isProactiveActive,
  getProactiveGoal,
  getProactiveElapsedMs,
  activateProactive,
  deactivateProactive,
} from './index.js'

export type ProactiveState = {
  active: boolean
  goal: string | null
  elapsedMs: number | null
  toggle: () => void
  activate: (goal?: string) => void
  deactivate: () => void
}

/**
 * React hook exposing proactive mode state and controls.
 * Polls state every second while active to update elapsed time.
 */
export function useProactive(): ProactiveState {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isProactiveActive()) return
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [tick])

  return {
    active: isProactiveActive(),
    goal: getProactiveGoal(),
    elapsedMs: getProactiveElapsedMs(),
    toggle() {
      if (isProactiveActive()) {
        deactivateProactive()
      } else {
        activateProactive()
      }
    },
    activate(goal?: string) {
      activateProactive(goal)
    },
    deactivate() {
      deactivateProactive()
    },
  }
}
