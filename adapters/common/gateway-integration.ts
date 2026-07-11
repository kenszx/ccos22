/**
 * CCOS Gateway Integration Helpers
 *
 * Utility functions for integrating existing platform adapters
 * with the Unified Message Gateway. Each adapter can optionally
 * use these to enable cross-platform features.
 *
 * Usage in an adapter (e.g., Telegram):
 *
 *   import { withGateway } from '../common/gateway-integration.js'
 *
 *   // On incoming message:
 *   const { user } = withGateway.resolve('telegram', msg.from.id)
 *
 *   // Register/update session:
 *   withGateway.session('telegram', user.ccosUserId, tgChatId, ccosSessionId)
 *
 *   // On outgoing message:
 *   gateway.enqueue({ userId: user.ccosUserId, text: reply, ... })
 */

import { gateway, type PlatformId, type UnifiedUser } from './unified-gateway.js'

// ============================================================================
// Resolver: maps incoming adapter messages to unified users
// ============================================================================

export const withGateway = {
  /**
   * Resolve a message sender through the gateway.
   * Call this when any adapter receives a message.
   */
  resolve(platform: PlatformId, platformUserId: string): {
    user: UnifiedUser
    isNew: boolean
  } {
    const user = gateway.resolveUser(platform, platformUserId)
    const isNew = !user.bindings.some(
      b => b.platform !== platform && b.active,
    )
    return { user, isNew }
  },

  /**
   * Register or touch a session for a user on a platform.
   * Call this at the start of each adapter conversation turn.
   */
  session(
    platform: PlatformId,
    ccosUserId: string,
    adapterSessionId: string,
    ccosSessionId: string,
  ): void {
    const existing = gateway.findCcosSession(ccosUserId, platform)
    if (existing) {
      gateway.touchSession(ccosUserId, adapterSessionId)
    } else {
      gateway.registerSession(ccosUserId, platform, adapterSessionId, ccosSessionId)
    }
  },

  /**
   * Get the CCOS session ID for a user's active platform session.
   * Returns null if no session exists — caller should create one.
   */
  getSession(ccosUserId: string, platform: PlatformId): string | null {
    return gateway.findCcosSession(ccosUserId, platform)
  },

  /**
   * Link two platform accounts to the same user.
   * Call when user authenticates on a second platform.
   */
  link(
    ccosUserId: string,
    newPlatform: PlatformId,
    newPlatformUserId: string,
  ): boolean {
    return gateway.bindPlatform(ccosUserId, newPlatform, newPlatformUserId) !== null
  },
}
