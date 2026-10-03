export type Step = {
  text: string
  isDone: boolean
  isMine: boolean
  isDetour: boolean
  depth: number
  /** PR references: "74", or "owner/repo#74" for another repo. */
  prs: string[]
}

export type Section = { title: string; steps: Step[] }

/** This session's goal and its checklist, as the bar draws them. */
export type Board = {
  goal: string | null
  detour: string | null
  section: Section | null
  /** One short line per other live goal: "Public API v1 (2 sessions, 3/4)". */
  others: string[]
}

/** A PR's state as the expanded bar labels it. */
export type PrLabel = { text: string; tone: 'ok' | 'open' | 'bad' }

export type Verdict = { isReady: boolean; reasons: string[]; questions: string[]; checkedAt: number; board: Board }

declare module 'claude-code' {
  interface PluginState {
    'archive-ready': { verdict: Verdict | null; showQuestions: boolean; expanded: boolean; prs: Record<string, PrLabel> }
  }
}
