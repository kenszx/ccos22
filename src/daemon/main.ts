/**
 * CCOS DAEMON — Background Service Manager
 *
 * Manages the daemon process lifecycle: startup, cron scheduling,
 * worker health monitoring, crash recovery, and graceful shutdown.
 *
 * The daemon runs as a companion to the CCOS desktop app. It:
 * - Picks up scheduled tasks from .claude/scheduled_tasks.json
 * - Dispatches cron fires to Agent execution
 * - Sends desktop notifications on task completion
 * - Auto-restarts workers on crash
 */

import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'

// Module-level state
let daemonRunning = false
let daemonStartTime: number | null = null
let workerCount = 0
const MAX_RESTART_ATTEMPTS = 3
const workerRestartCounts = new Map<string, number>()

export type DaemonWorker = {
  id: string
  type: 'cron' | 'agent' | 'watchdog'
  startedAt: number
  lastHeartbeat: number
  status: 'running' | 'idle' | 'error' | 'stopped'
}

const workers = new Map<string, DaemonWorker>()

/** Check if the daemon is currently running. */
export function isDaemonRunning(): boolean {
  return daemonRunning
}

/** Get daemon uptime in milliseconds. */
export function getDaemonUptimeMs(): number | null {
  if (daemonStartTime === null) return null
  return Date.now() - daemonStartTime
}

/** Start the CCOS daemon. */
export function startDaemon(): void {
  if (daemonRunning) {
    logForDebugging('[CCOS] Daemon already running')
    return
  }

  daemonRunning = true
  daemonStartTime = Date.now()
  logForDebugging('[CCOS] Daemon started')

  // Register system signal handlers for graceful shutdown
  if (typeof process !== 'undefined') {
    process.on('SIGTERM', () => stopDaemon('SIGTERM'))
    process.on('SIGINT', () => stopDaemon('SIGINT'))
  }
}

/** Stop the CCOS daemon gracefully. */
export function stopDaemon(reason?: string): void {
  if (!daemonRunning) return

  logForDebugging(
    `[CCOS] Daemon stopping${reason ? ` (${reason})` : ''}` +
    (daemonStartTime ? ` after ${Date.now() - daemonStartTime}ms` : ''),
  )

  // Stop all workers
  for (const [id, worker] of workers) {
    worker.status = 'stopped'
    logForDebugging(`[CCOS] Worker stopped: ${id} (${worker.type})`)
  }
  workers.clear()
  workerRestartCounts.clear()

  daemonRunning = false
  daemonStartTime = null
  workerCount = 0
}

/** Register a new worker with the daemon. */
export function registerWorker(
  id: string,
  type: DaemonWorker['type'],
): DaemonWorker {
  const worker: DaemonWorker = {
    id,
    type,
    startedAt: Date.now(),
    lastHeartbeat: Date.now(),
    status: 'running',
  }
  workers.set(id, worker)
  workerCount++
  logForDebugging(`[CCOS] Worker registered: ${id} (${type}) [total: ${workerCount}]`)
  return worker
}

/** Unregister a worker from the daemon. */
export function unregisterWorker(id: string): void {
  const worker = workers.get(id)
  if (worker) {
    worker.status = 'stopped'
    workers.delete(id)
    workerCount--
    workerRestartCounts.delete(id)
    logForDebugging(`[CCOS] Worker unregistered: ${id} [total: ${workerCount}]`)
  }
}

/** Update a worker's heartbeat timestamp. */
export function heartbeatWorker(id: string): void {
  const worker = workers.get(id)
  if (worker) {
    worker.lastHeartbeat = Date.now()
    if (worker.status === 'error') {
      worker.status = 'running'
    }
  }
}

/** Mark a worker as errored and optionally restart it. */
export function workerError(id: string): boolean {
  const worker = workers.get(id)
  if (!worker) return false

  worker.status = 'error'
  const attempts = (workerRestartCounts.get(id) ?? 0) + 1

  if (attempts <= MAX_RESTART_ATTEMPTS) {
    workerRestartCounts.set(id, attempts)
    logForDebugging(
      `[CCOS] Worker ${id} error, restart attempt ${attempts}/${MAX_RESTART_ATTEMPTS}`,
    )
    return true // signal caller to restart
  }

  logError(
    `[CCOS] Worker ${id} exceeded max restart attempts (${MAX_RESTART_ATTEMPTS}), stopping`,
  )
  unregisterWorker(id)
  return false
}

/** Get all registered workers. */
export function getWorkers(): DaemonWorker[] {
  return Array.from(workers.values())
}

/** Get count of active (non-stopped) workers. */
export function getActiveWorkerCount(): number {
  return Array.from(workers.values()).filter(
    w => w.status === 'running' || w.status === 'idle',
  ).length
}

/** Get daemon status summary. */
export function getDaemonStatus(): {
  running: boolean
  uptimeMs: number | null
  activeWorkers: number
  totalWorkers: number
} {
  return {
    running: daemonRunning,
    uptimeMs: getDaemonUptimeMs(),
    activeWorkers: getActiveWorkerCount(),
    totalWorkers: workerCount,
  }
}
