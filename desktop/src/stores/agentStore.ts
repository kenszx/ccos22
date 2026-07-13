import { create } from 'zustand'
import { agentsApi, type AgentDefinition, type CreateAgentInput } from '../api/agents'

export type AgentDetailReturnTab = 'agents' | 'plugins'

type AgentStore = {
  activeAgents: AgentDefinition[]
  allAgents: AgentDefinition[]
  isLoading: boolean
  error: string | null
  selectedAgent: AgentDefinition | null
  selectedAgentReturnTab: AgentDetailReturnTab
  isCreating: boolean

  fetchAgents: (cwd?: string, nocache?: boolean) => Promise<void>
  selectAgent: (
    agent: AgentDefinition | null,
    returnTab?: AgentDetailReturnTab,
  ) => void
  createAgent: (input: CreateAgentInput, cwd?: string) => Promise<void>
  deleteAgent: (name: string, cwd?: string) => Promise<void>
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  activeAgents: [],
  allAgents: [],
  isLoading: false,
  error: null,
  selectedAgent: null,
  selectedAgentReturnTab: 'agents',
  isCreating: false,

  fetchAgents: async (cwd, nocache = false) => {
    set({ isLoading: true, error: null })
    try {
      const { activeAgents, allAgents } = await agentsApi.list(cwd, nocache)
      set({ activeAgents, allAgents, isLoading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load agents'
      set({ isLoading: false, error: message })
    }
  },

  selectAgent: (agent, returnTab = 'agents') =>
    set({
      selectedAgent: agent,
      selectedAgentReturnTab: agent ? returnTab : 'agents',
    }),

  createAgent: async (input, cwd) => {
    set({ isCreating: true, error: null })
    try {
      await agentsApi.create(input)
      // nocache=true forces server to bypass memoize and re-read filesystem
      await get().fetchAgents(cwd, true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create agent'
      set({ error: message })
      throw error
    } finally {
      set({ isCreating: false })
    }
  },

  deleteAgent: async (name, cwd) => {
    set({ error: null })
    try {
      await agentsApi.delete(name)
      await get().fetchAgents(cwd)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete agent'
      set({ error: message })
      throw error
    }
  },
}))
