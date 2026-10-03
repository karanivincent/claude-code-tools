/** What a prompt did to the session's goal. */
export type StepKind = 'goal' | 'continue' | 'detour' | 'back'

export type Step = {
  at: number
  kind: StepKind
  /** A few words naming what this step was about. */
  topic: string
  /** The prompt's opening words, for the tooltip. */
  text: string
  /** The goal this step served; absent on records written before a session could change goals. */
  goalId?: string
}

export type SessionRecord = {
  id: string
  cwd: string
  branch: string
  goalId: string | null
  startedAt: number
  lastActiveAt: number
  status: 'working' | 'idle' | 'ended'
  steps: Step[]
  /** PRs this session opened or merged, with when it first saw each. */
  prs: { number: number; at: number; repo?: string; goalId?: string }[]
  /** owner/name of the session's own repo, from its origin remote. */
  repo?: string
  /** The question the session last left you, cleared when you answer. */
  question: { text: string; at: number } | null
  /** Filled by the backfill, which cannot see live status. */
  isBackfilled?: boolean
}

export type Goal = {
  id: string
  title: string
  createdAt: number
  doneAt: number | null
}

export type PrState = {
  repo: string
  number: number
  title: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  isDraft: boolean
  checks: 'passing' | 'failing' | 'pending' | 'none'
  url: string
  labels: string[]
  updatedAt: string
}

export type WaitingItem = {
  kind: 'question' | 'step' | 'merge' | 'decision' | 'founder-click' | 'failing' | 'duplicate'
  title: string
  url: string | null
  /** The goal or session it belongs to, when known. */
  where: string
}

export type Snapshot = {
  goals: Goal[]
  sessions: SessionRecord[]
  prs: Record<string, PrState>
  waiting: WaitingItem[]
  refreshedAt: number
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'goal-map': {
      snapshot: Snapshot | null
      view: 'map' | 'waiting'
      showDone: boolean
    }
  }
}
