import { api } from './client'

export type ProfileInfo = {
  name: string
  displayName: string
  icon?: string
  active: boolean
  createdAt: number
}

export type ProfileListResponse = {
  active: ProfileInfo
  profiles: ProfileInfo[]
}

export const profilesApi = {
  list: () => api.get<ProfileListResponse>('/api/profiles'),

  create: (name: string, displayName: string, icon?: string) =>
    api.post<{ profile: ProfileInfo }>('/api/profiles', { name, displayName, icon }),

  switch: (name: string) =>
    api.put<{ path: string; active: string }>('/api/profiles/switch', { name }),

  delete: (name: string) =>
    api.delete<{ ok: boolean }>(`/api/profiles/${encodeURIComponent(name)}`),
}
