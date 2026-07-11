/**
 * CCOS Unified Message Gateway
 *
 * Routes messages across all IM platforms (Feishu, DingTalk, WeChat,
 * Telegram, WhatsApp) with cross-platform user identity mapping and
 * session continuity. Provides a single API for sending/receiving
 * messages regardless of the underlying platform.
 *
 * Design principles:
 * 1. Each adapter remains independent and self-contained
 * 2. The gateway wraps them with cross-cutting concerns:
 *    - Cross-platform user identity
 *    - Session continuity (switch device, keep conversation)
 *    - Message routing (which platform gets which message)
 *    - Priority-based delivery
 */

import { randomUUID } from 'crypto'

// ============================================================================
// Types
// ============================================================================

export type PlatformId = 'feishu' | 'dingtalk' | 'wechat' | 'telegram' | 'whatsapp' | 'cli' | 'web'

export type UnifiedUser = {
  /** CCOS internal user ID (links all platform accounts) */
  ccosUserId: string
  /** Platform-specific account bindings */
  bindings: PlatformBinding[]
  /** Display name across platforms */
  displayName: string
  /** Preferred platform for notifications */
  primaryPlatform: PlatformId
  /** Active sessions */
  activeSessions: ActiveSession[]
}

export type PlatformBinding = {
  platform: PlatformId
  /** Platform-specific user ID (e.g. Telegram user ID, Feishu open_id) */
  platformUserId: string
  /** When this binding was created */
  boundAt: number
  /** Whether this binding is active */
  active: boolean
}

export type ActiveSession = {
  sessionId: string
  platform: PlatformId
  /** The CCOS session ID this adapter session maps to */
  ccosSessionId: string
  startedAt: number
  lastActivityAt: number
}

export type UnifiedMessage = {
  id: string
  /** Target user */
  userId: string
  /** Content text */
  text: string
  /** Platform to deliver on (undefined = user's primary) */
  platform?: PlatformId
  /** Priority: 'normal' | 'urgent' (urgent pushes to all platforms) */
  priority: 'normal' | 'urgent'
  /** Whether to notify the user (sound/banner) */
  notify: boolean
  /** Timestamp */
  createdAt: number
  /** Arbitrary metadata */
  metadata?: Record<string, string>
}

export type GatewayStatus = {
  activeUsers: number
  activeSessions: number
  platformCounts: Record<PlatformId, number>
  queueDepth: number
}

// ============================================================================
// Gateway State
// ============================================================================

class UnifiedGateway {
  private users = new Map<string, UnifiedUser>()
  private messageQueue: UnifiedMessage[] = []
  private maxQueueSize = 1000

  // ==========================================================================
  // User Management
  // ==========================================================================

  /** Register or lookup a user by platform binding. */
  resolveUser(platform: PlatformId, platformUserId: string): UnifiedUser {
    // Check existing bindings
    for (const user of this.users.values()) {
      const binding = user.bindings.find(
        b => b.platform === platform && b.platformUserId === platformUserId,
      )
      if (binding) {
        binding.active = true
        return user
      }
    }

    // Create new user
    const user: UnifiedUser = {
      ccosUserId: randomUUID(),
      bindings: [{
        platform,
        platformUserId,
        boundAt: Date.now(),
        active: true,
      }],
      displayName: `${platform}:${platformUserId.slice(0, 8)}`,
      primaryPlatform: platform,
      activeSessions: [],
    }
    this.users.set(user.ccosUserId, user)
    return user
  }

  /** Bind an additional platform to an existing user. */
  bindPlatform(
    ccosUserId: string,
    platform: PlatformId,
    platformUserId: string,
  ): PlatformBinding | null {
    const user = this.users.get(ccosUserId)
    if (!user) return null

    // Check if this binding already exists
    const existing = user.bindings.find(
      b => b.platform === platform && b.platformUserId === platformUserId,
    )
    if (existing) {
      existing.active = true
      return existing
    }

    const binding: PlatformBinding = {
      platform,
      platformUserId,
      boundAt: Date.now(),
      active: true,
    }
    user.bindings.push(binding)
    return binding
  }

  /** Unbind a platform from a user. */
  unbindPlatform(ccosUserId: string, platform: PlatformId): boolean {
    const user = this.users.get(ccosUserId)
    if (!user) return false

    const binding = user.bindings.find(b => b.platform === platform)
    if (binding) {
      binding.active = false
    }

    // If user was using this as primary, switch to first available
    if (user.primaryPlatform === platform) {
      const alt = user.bindings.find(b => b.active)
      if (alt) user.primaryPlatform = alt.platform
    }
    return true
  }

  /** Get user by CCOS user ID. */
  getUser(ccosUserId: string): UnifiedUser | null {
    return this.users.get(ccosUserId) ?? null
  }

  /** Set user's primary notification platform. */
  setPrimaryPlatform(ccosUserId: string, platform: PlatformId): boolean {
    const user = this.users.get(ccosUserId)
    if (!user) return false
    const binding = user.bindings.find(b => b.platform === platform && b.active)
    if (!binding) return false
    user.primaryPlatform = platform
    return true
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  /** Register an active session for a user on a platform. */
  registerSession(
    ccosUserId: string,
    platform: PlatformId,
    adapterSessionId: string,
    ccosSessionId: string,
  ): ActiveSession | null {
    const user = this.users.get(ccosUserId)
    if (!user) return null

    const session: ActiveSession = {
      sessionId: adapterSessionId,
      platform,
      ccosSessionId,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    }
    user.activeSessions.push(session)
    return session
  }

  /** Update session activity timestamp. */
  touchSession(ccosUserId: string, adapterSessionId: string): void {
    const user = this.users.get(ccosUserId)
    if (!user) return
    const session = user.activeSessions.find(s => s.sessionId === adapterSessionId)
    if (session) {
      session.lastActivityAt = Date.now()
    }
  }

  /** End a session. */
  endSession(ccosUserId: string, adapterSessionId: string): void {
    const user = this.users.get(ccosUserId)
    if (!user) return
    user.activeSessions = user.activeSessions.filter(
      s => s.sessionId !== adapterSessionId,
    )
  }

  /** Find the CCOS session for a user on a platform. */
  findCcosSession(ccosUserId: string, platform: PlatformId): string | null {
    const user = this.users.get(ccosUserId)
    if (!user) return null
    const session = user.activeSessions.find(s => s.platform === platform)
    return session?.ccosSessionId ?? null
  }

  // ==========================================================================
  // Message Routing
  // ==========================================================================

  /** Enqueue a message for delivery. */
  enqueue(message: Omit<UnifiedMessage, 'id' | 'createdAt'>): string {
    if (this.messageQueue.length >= this.maxQueueSize) {
      // Drop oldest non-urgent message
      const idx = this.messageQueue.findIndex(m => m.priority !== 'urgent')
      if (idx !== -1) this.messageQueue.splice(idx, 1)
    }

    const msg: UnifiedMessage = {
      ...message,
      id: randomUUID(),
      createdAt: Date.now(),
    }
    this.messageQueue.push(msg)
    return msg.id
  }

  /** Dequeue messages for a specific user/platform. */
  dequeue(userId: string, platform: PlatformId): UnifiedMessage[] {
    const user = this.users.get(userId)
    if (!user) return []

    const messages: UnifiedMessage[] = []

    // Collect messages for this user
    let i = this.messageQueue.length
    while (i--) {
      const msg = this.messageQueue[i]
      if (msg.userId !== userId) continue

      // Include if: targeted to this platform, or urgent (all platforms),
      // or no platform specified and this is the primary
      if (
        msg.platform === platform ||
        msg.priority === 'urgent' ||
        (!msg.platform && user.primaryPlatform === platform)
      ) {
        messages.push(msg)
        this.messageQueue.splice(i, 1)
      }
    }

    return messages.reverse() // oldest first
  }

  /** Get queue depth for monitoring. */
  getQueueDepth(): number {
    return this.messageQueue.length
  }

  // ==========================================================================
  // Status
  // ==========================================================================

  /** Get gateway status for monitoring. */
  getStatus(): GatewayStatus {
    const platformCounts: Record<PlatformId, number> = {
      feishu: 0, dingtalk: 0, wechat: 0, telegram: 0, whatsapp: 0, cli: 0, web: 0,
    }

    let activeSessions = 0
    for (const user of this.users.values()) {
      activeSessions += user.activeSessions.length
      for (const binding of user.bindings) {
        if (binding.active) {
          platformCounts[binding.platform] = (platformCounts[binding.platform] ?? 0) + 1
        }
      }
    }

    return {
      activeUsers: this.users.size,
      activeSessions,
      platformCounts,
      queueDepth: this.messageQueue.length,
    }
  }
}

// ============================================================================
// Singleton export
// ============================================================================

export const gateway = new UnifiedGateway()

/**
 * Convenience: resolve a user from a platform message.
 * Returns { user, isNew } indicating whether a new user was created.
 */
export function resolveMessageSender(
  platform: PlatformId,
  platformUserId: string,
): { user: UnifiedUser; isNew: boolean } {
  const preCount = gateway.getStatus().activeUsers
  const user = gateway.resolveUser(platform, platformUserId)
  return { user, isNew: gateway.getStatus().activeUsers > preCount }
}
