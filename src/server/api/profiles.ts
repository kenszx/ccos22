/**
 * Profiles REST API
 *
 * GET    /api/profiles          — List all profiles + active
 * POST   /api/profiles          — Create a new profile
 * PUT    /api/profiles/switch   — Switch active profile
 * DELETE /api/profiles/:name    — Delete a profile
 */

import {
  listProfiles,
  createProfile,
  deleteProfile,
  getActiveProfile,
  type ProfileEntry,
} from '../../utils/profileEngine.js'
import { profileSwitchCoordinator } from '../services/profileSwitchCoordinator.js'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'

export async function handleProfilesApi(
  req: Request,
  _url: URL,
  segments: string[],
): Promise<Response> {
  try {
    const sub = segments[2] // 'switch' or profile name

    if (req.method === 'GET') {
      const registry = listProfiles()
      const active = getActiveProfile()
      const list: Array<ProfileEntry & { active: boolean }> = Object.values(
        registry.profiles,
      ).map((p) => ({ ...p, active: p.name === registry.active }))
      return Response.json({ active, profiles: list })
    }

    if (req.method === 'POST' && !sub) {
      const body = await req.json()
      if (!body.name || typeof body.name !== 'string') {
        throw ApiError.badRequest('Missing "name" in request body')
      }
      const entry = createProfile(
        body.name as string,
        (body.displayName as string) || body.name,
        body.icon as string | undefined,
      )
      return Response.json({ profile: entry }, { status: 201 })
    }

    if (req.method === 'PUT' && sub === 'switch') {
      const body = await req.json()
      if (!body.name || typeof body.name !== 'string') {
        throw ApiError.badRequest('Missing "name" in request body')
      }

      // 使用协调器执行完整切换（停止 session、断开连接、切换目录、重启服务）
      await profileSwitchCoordinator.switchProfile(body.name as string)

      const active = getActiveProfile()
      return Response.json({ active: active.name })
    }

    if (req.method === 'DELETE' && sub) {
      deleteProfile(sub)
      return Response.json({ ok: true })
    }

    throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
  } catch (error) {
    return errorResponse(error)
  }
}
