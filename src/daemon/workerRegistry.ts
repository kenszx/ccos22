/**
 * CCOS Worker Registry — Persistent worker tracking.
 *
 * Stores worker state to disk so daemon workers survive process restarts.
 * Workers are serialized to .claude/daemon/workers.json.
 */

import { mkdir, readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'
import { safeParseJSON } from '../utils/json.js'

const WORKERS_FILENAME = 'workers.json'

type PersistentWorker = {
  id: string
  type: 'cron' | 'agent' | 'watchdog'
  registeredAt: number
  lastRunAt: number | null
  lastResult: 'success' | 'failure' | null
  restartCount: number
}

type WorkerRegistryFile = {
  workers: PersistentWorker[]
  updatedAt: number
}

/**
 * Get the path to the daemon workers directory.
 * Uses CCOS_DATA_DIR if set, otherwise defaults to ~/.claude/daemon/
 */
function getDaemonDir(): string {
  if (process.env.CCOS_DATA_DIR) {
    return process.env.CCOS_DATA_DIR
  }
  const home = process.env.HOME || process.env.USERPROFILE || '.'
  return join(home, '.claude', 'daemon')
}

function getRegistryPath(): string {
  return join(getDaemonDir(), WORKERS_FILENAME)
}

/** Read the worker registry from disk. */
async function readRegistry(): Promise<WorkerRegistryFile> {
  try {
    const data = await readFile(getRegistryPath(), 'utf-8')
    return safeParseJSON(data, { workers: [], updatedAt: Date.now() })
  } catch {
    return { workers: [], updatedAt: Date.now() }
  }
}

/** Write the worker registry to disk atomically. */
async function writeRegistry(registry: WorkerRegistryFile): Promise<void> {
  try {
    const dir = getDaemonDir()
    await mkdir(dir, { recursive: true })
    registry.updatedAt = Date.now()
    await writeFile(
      getRegistryPath(),
      JSON.stringify(registry, null, 2),
      'utf-8',
    )
  } catch (err) {
    logError(`[CCOS] Failed to write worker registry: ${err}`)
  }
}

/** Register a persistent worker. */
export async function persistWorker(
  id: string,
  type: PersistentWorker['type'],
): Promise<void> {
  const registry = await readRegistry()
  const existing = registry.workers.find(w => w.id === id)
  if (existing) {
    existing.registeredAt = Date.now()
  } else {
    registry.workers.push({
      id,
      type,
      registeredAt: Date.now(),
      lastRunAt: null,
      lastResult: null,
      restartCount: 0,
    })
  }
  await writeRegistry(registry)
  logForDebugging(`[CCOS] Worker persisted: ${id} (${type})`)
}

/** Record a worker run result. */
export async function recordWorkerRun(
  id: string,
  result: 'success' | 'failure',
): Promise<void> {
  const registry = await readRegistry()
  const worker = registry.workers.find(w => w.id === id)
  if (worker) {
    worker.lastRunAt = Date.now()
    worker.lastResult = result
    if (result === 'failure') {
      worker.restartCount++
    }
    await writeRegistry(registry)
  }
}

/** Remove a worker from the registry. */
export async function removePersistedWorker(id: string): Promise<void> {
  const registry = await readRegistry()
  registry.workers = registry.workers.filter(w => w.id !== id)
  await writeRegistry(registry)
}

/** List all persisted workers. */
export async function listPersistedWorkers(): Promise<PersistentWorker[]> {
  const registry = await readRegistry()
  return registry.workers
}

/** Clean up the registry file (for testing). */
export async function clearRegistry(): Promise<void> {
  try {
    await unlink(getRegistryPath())
  } catch {
    // File doesn't exist, nothing to clean
  }
}
