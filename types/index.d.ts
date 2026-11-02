export type Call = {
  id: string
  tool: string
  label: string
  startedAt: number
  agentId?: string
}

export type Step = { index: number; model: string } | null

export type Pending = { tool: string; label: string } | null

declare module 'claude-code' {
  interface PluginState {
    'now-doing': { calls: Shaped<Call[]>; step: Step; pending: Pending }
  }
}
