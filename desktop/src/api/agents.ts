import { api } from './client'

export type AgentSource =
  | 'built-in'
  | 'plugin'
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'flagSettings'
  | 'policySettings'

export type AgentDefinition = {
  agentType: string
  description?: string
  model?: string
  modelDisplay?: string
  tools?: string[]
  systemPrompt?: string
  color?: string
  source: AgentSource
  baseDir?: string
  overriddenBy?: AgentSource
  isActive: boolean
}

export type AgentListResponse = {
  activeAgents: AgentDefinition[]
  allAgents: AgentDefinition[]
}

export type CreateAgentInput = {
  name: string
  description?: string
  model?: string
  tools?: string[]
  systemPrompt?: string
  color?: string
}

export const agentsApi = {
  list: (cwd?: string, nocache?: boolean) => {
    const params = new URLSearchParams()
    if (cwd) params.set('cwd', cwd)
    if (nocache) params.set('nocache', '1')
    const qs = params.toString()
    return api.get<AgentListResponse>(`/api/agents${qs ? '?' + qs : ''}`)
  },
  create: (input: CreateAgentInput) => {
    return api.post<{ ok: boolean; agent: AgentDefinition }>('/api/agents', input)
  },
  update: (name: string, input: Partial<CreateAgentInput>) => {
    return api.put<{ agent: AgentDefinition }>(
      `/api/agents/${encodeURIComponent(name)}`,
      input,
    )
  },
  delete: (name: string) => {
    return api.delete<{ ok: boolean }>(
      `/api/agents/${encodeURIComponent(name)}`,
    )
  },
}
