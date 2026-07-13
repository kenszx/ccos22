/**
 * CCOS Multi-Profile Engine
 *
 * Manages isolated data directories per profile. Each profile has its own
 * settings, agents, memory, skills, rules, sessions, and scheduled tasks.
 *
 * Layout:
 *   ~/.ccos/
 *     profiles.json                  ← registry: active profile + profile list
 *     profiles/<name>/
 *       settings.json                ← per-profile settings
 *       agents/                      ← per-profile agent definitions
 *       agent-memory/                ← per-agent memory (within profile)
 *       memory/                      ← auto-memory memdir
 *       skills/                      ← per-profile skills
 *       rules/                       ← per-profile wiki/rules
 *       sessions/                    ← per-profile session transcripts
 *       scheduled_tasks.json         ← per-profile cron tasks
 */

import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { logForDebugging } from './debug.js'

const CCOS_HOME = join(homedir(), '.ccos')
const REGISTRY_PATH = join(CCOS_HOME, 'profiles.json')
const PROFILES_DIR = join(CCOS_HOME, 'profiles')
const DEFAULT_PROFILE = 'default'

export type ProfileEntry = {
  name: string
  displayName: string
  icon?: string
  createdAt: number
}

export type ProfileRegistry = {
  active: string
  profiles: Record<string, ProfileEntry>
  version: number
}

function ensureCCOSHome(): void {
  if (!existsSync(CCOS_HOME)) {
    mkdirSync(CCOS_HOME, { recursive: true })
  }
}

function readRegistry(): ProfileRegistry {
  ensureCCOSHome()
  try {
    const raw = readFileSync(REGISTRY_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed?.active && parsed?.profiles) {
      return {
        active: parsed.active,
        profiles: parsed.profiles,
        version: parsed.version ?? 1,
      }
    }
  } catch {
    // File doesn't exist or is corrupted — return default
  }

  // First run: create default profile
  const registry: ProfileRegistry = {
    active: DEFAULT_PROFILE,
    profiles: {
      [DEFAULT_PROFILE]: {
        name: DEFAULT_PROFILE,
        displayName: 'Default',
        icon: 'person',
        createdAt: Date.now(),
      },
    },
    version: 1,
  }
  writeRegistry(registry)
  ensureProfileDir(DEFAULT_PROFILE)
  return registry
}

function writeRegistry(registry: ProfileRegistry): void {
  ensureCCOSHome()
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8')
}

function ensureProfileDir(name: string): string {
  const dir = join(PROFILES_DIR, name)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** Get the active profile's data directory path. */
export function getActiveProfilePath(): string {
  const registry = readRegistry()
  const name = registry.active
  return ensureProfileDir(name)
}

/** Get the standard data directory (used by getClaudeConfigHomeDir override). */
export function getProfileConfigHomeDir(): string {
  return getActiveProfilePath()
}

/** Get the list of all profiles. */
export function listProfiles(): ProfileRegistry {
  return readRegistry()
}

/** Create a new profile and return its path. */
export function createProfile(name: string, displayName: string, icon?: string): ProfileEntry {
  const registry = readRegistry()
  if (registry.profiles[name]) {
    throw new Error(`Profile "${name}" already exists`)
  }
  const entry: ProfileEntry = {
    name,
    displayName,
    icon: icon ?? 'person',
    createdAt: Date.now(),
  }
  registry.profiles[name] = entry
  writeRegistry(registry)
  ensureProfileDir(name)
  logForDebugging(`[CCOS] Profile created: ${name} (${displayName})`)
  return entry
}

/** Delete a profile. Cannot delete the active profile. */
export function deleteProfile(name: string): void {
  const registry = readRegistry()
  if (name === registry.active) {
    throw new Error(`Cannot delete the active profile "${name}". Switch to another profile first.`)
  }
  if (!registry.profiles[name]) {
    throw new Error(`Profile "${name}" not found`)
  }
  delete registry.profiles[name]
  writeRegistry(registry)
  logForDebugging(`[CCOS] Profile deleted: ${name}`)
  // Note: data directory is NOT deleted automatically — user can manually remove ~/.ccos/profiles/<name>/
}

/** Switch to a different profile. Returns the new profile's path. */
export function switchProfile(name: string): string {
  const registry = readRegistry()
  if (!registry.profiles[name]) {
    throw new Error(`Profile "${name}" not found`)
  }
  registry.active = name
  writeRegistry(registry)
  logForDebugging(`[CCOS] Profile switched to: ${name}`)
  return ensureProfileDir(name)
}

/** Get the active profile name. */
export function getActiveProfileName(): string {
  return readRegistry().active
}

/** Get the active profile entry. */
export function getActiveProfile(): ProfileEntry {
  const registry = readRegistry()
  return registry.profiles[registry.active] ?? registry.profiles[DEFAULT_PROFILE]
}

/** Get a specific profile's data directory path by name. */
export function getProfilePath(name: string): string {
  return join(PROFILES_DIR, name)
}

/**
 * Migrate: if ~/.claude/ exists but ~/.ccos/profiles/default/ doesn't,
 * offer to migrate by setting CLAUDE_CONFIG_DIR to ~/.ccos/profiles/default/.
 * This is NOT automatic — it's opt-in via first-run dialog.
 */
export async function tryMigrateOldData(): Promise<{ migrated: boolean; oldPath: string; newPath: string } | null> {
  const { existsSync, renameSync, mkdirSync } = await import('fs')
  const { join } = await import('path')
  const { homedir } = await import('os')

  const oldPath = join(homedir(), '.claude')
  const newPath = join(PROFILES_DIR, DEFAULT_PROFILE)

  if (existsSync(oldPath) && !existsSync(join(newPath, 'settings.json'))) {
    return { migrated: false, oldPath, newPath }
  }
  return null
}
