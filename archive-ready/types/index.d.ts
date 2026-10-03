export type Verdict = { isReady: boolean; reasons: string[]; questions: string[]; checkedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'archive-ready': { verdict: Verdict | null; showQuestions: boolean }
  }
}
