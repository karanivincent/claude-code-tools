// Pure decisions for goal-map: no `$`, no I/O, so `node --test` can reach them.

import type { Goal, PrState, SessionRecord, Snapshot, Step, StepKind, WaitingItem } from '../types'

export const DAY = 24 * 60 * 60 * 1000
/** A session that has not written for this long is quiet, whatever it last claimed. */
export const QUIET_MS = 6 * 60 * 60 * 1000
export const ACTIVE_DAYS = 7

export function slug(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || 'goal'
}

export function clip(text: string, n: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}

export function ago(ms: number, now: number): string {
  const m = Math.max(0, Math.round((now - ms) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.round(h / 24)}d`
}

// ── Classifying a prompt ────────────────────────────────────────────────────

export type Classification = {
  kind: StepKind
  goalId: string | null
  newGoalTitle: string | null
  topic: string
}

export function classifierPrompt(input: {
  prompt: string
  current: Goal | null
  recent: Step[]
  isInDetour: boolean
  openGoals: Goal[]
  /** When the session ran before the mod saw it: its first prompts, so the goal comes from them. */
  sessionStart?: string
}): string {
  const goals = input.openGoals.slice(0, 20).map(g => `- ${g.id}: ${g.title}`).join('\n') || '(none)'
  const recent = input.recent.slice(-4).map(s => `- ${s.kind}: ${s.topic}`).join('\n') || '(none)'
  return [
    'You track what a software founder is working on across many Claude Code sessions.',
    'Classify the NEW PROMPT below. Answer with one JSON object and nothing else:',
    '{"kind": "goal" | "continue" | "detour" | "back", "goalId": string | null, "newGoalTitle": string | null, "topic": string}',
    '',
    'Rules:',
    '- "goal": the session has no goal yet, or the founder explicitly drops the old one for a new main goal.',
    '  Set goalId to an id from OPEN GOALS when the prompt is clearly the same piece of work; otherwise goalId null and newGoalTitle a 3-7 word title naming the outcome.',
    '- "continue": still serving the current goal (follow-ups, approvals, "yes", "merge it", fixes the goal needs).',
    '- "detour": a side task the current goal does not need — fixing something unrelated, a product musing, a question about another area.',
    '- "back": the session is in a detour and this prompt returns to the current goal.',
    '- Short replies ("yes", "go ahead", "continue", "merge") are always "continue" (or "back" never).',
    '- topic: 2-6 words naming what this prompt is about.',
    '',
    ...(input.sessionStart
      ? ['SESSION SO FAR (name the goal from this, not from a follow-up question):', clip(input.sessionStart, 1200), '']
      : []),
    `CURRENT GOAL: ${input.current ? input.current.title : '(none)'}`,
    `IN A DETOUR NOW: ${input.isInDetour ? 'yes' : 'no'}`,
    'RECENT STEPS:',
    recent,
    'OPEN GOALS:',
    goals,
    '',
    'NEW PROMPT:',
    clip(input.prompt, 1500),
  ].join('\n')
}

export function parseClassification(text: string, hasGoal: boolean): Classification | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const raw = JSON.parse(match[0]) as Partial<Classification>
    const kinds: StepKind[] = ['goal', 'continue', 'detour', 'back']
    let kind = kinds.includes(raw.kind as StepKind) ? (raw.kind as StepKind) : 'continue'
    if (!hasGoal) kind = 'goal'
    return {
      kind,
      goalId: typeof raw.goalId === 'string' && raw.goalId ? raw.goalId : null,
      newGoalTitle: typeof raw.newGoalTitle === 'string' && raw.newGoalTitle ? clip(raw.newGoalTitle, 60) : null,
      topic: clip(typeof raw.topic === 'string' ? raw.topic : '', 50),
    }
  } catch {
    return null
  }
}

/** Short replies never change the goal, and never cost a model call. */
export function isTrivialPrompt(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length === 0) return true
  if (t.startsWith('/')) return true
  return t.length < 25 && /^(y(es)?|ok(ay)?|sure|go( ahead)?|continue|proceed|do it|merge( it)?|thanks?|lgtm|approved?|fine|next)\b/.test(t)
}

export function isInDetour(steps: Step[]): boolean {
  for (let i = steps.length - 1; i >= 0; i--) {
    const k = steps[i]!.kind
    if (k === 'detour') return true
    if (k === 'back' || k === 'goal') return false
  }
  return false
}

/** The question a finished turn leaves, if its last paragraph asks one. */
export function trailingQuestion(text: string): string | null {
  const paras = text.trim().split(/\n\s*\n/)
  const last = (paras[paras.length - 1] ?? '').trim()
  if (!last.endsWith('?')) return null
  const sentences = last.split(/(?<=[.!?])\s+/)
  return clip(sentences[sentences.length - 1] ?? last, 140)
}

export function prNumbersIn(command: string, stdout: string): number[] {
  const found = new Set<number>()
  if (/\bgh\s+pr\s+(create|merge|ready)\b/.test(command)) {
    for (const m of stdout.matchAll(/\/pull\/(\d+)/g)) found.add(Number(m[1]))
    const direct = command.match(/\bgh\s+pr\s+(?:merge|ready)\s+(\d+)/)
    if (direct) found.add(Number(direct[1]))
  }
  return [...found]
}

// ── What is waiting on you ──────────────────────────────────────────────────

export function checksOf(rollup: unknown): PrState['checks'] {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none'
  let pending = false
  for (const c of rollup as { conclusion?: string; state?: string; status?: string }[]) {
    const v = (c.conclusion || c.state || '').toUpperCase()
    if (['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(v)) return 'failing'
    if (!v || ['PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED'].includes(v) || (c.status && c.status !== 'COMPLETED')) pending = true
  }
  return pending ? 'pending' : 'passing'
}

/** Issue numbers a PR title names, as "(#2229)" or "#2229". */
export function issueRefs(title: string): number[] {
  return [...title.matchAll(/#(\d{2,6})/g)].map(m => Number(m[1]))
}

export function sessionLabel(s: SessionRecord, goals: Goal[]): string {
  const g = goals.find(x => x.id === s.goalId)
  return g ? g.title : s.branch || s.id.slice(0, 8)
}

export function waitingItems(input: {
  sessions: SessionRecord[]
  goals: Goal[]
  prs: Record<string, PrState>
  decisions: { number: number; title: string; url: string }[]
  now: number
  /** Unticked @me steps per session id. */
  mySteps?: Record<string, string[]>
}): WaitingItem[] {
  const items: WaitingItem[] = []
  const owner = new Map<number, SessionRecord>()
  for (const s of input.sessions) for (const p of s.prs) owner.set(p.number, s)
  const where = (n: number): string => {
    const s = owner.get(n)
    return s ? sessionLabel(s, input.goals) : 'agent lane'
  }

  for (const s of input.sessions) {
    if (!s.question || s.isBackfilled) continue
    if (input.now - s.question.at > 3 * DAY) continue
    items.push({ kind: 'question', title: s.question.text, url: null, where: `${sessionLabel(s, input.goals)} · ${s.branch}` })
  }

  for (const s of input.sessions) {
    for (const text of input.mySteps?.[s.id] ?? []) {
      items.push({ kind: 'step', title: text, url: null, where: `${sessionLabel(s, input.goals)} · TASKS.md` })
    }
  }

  const open = Object.values(input.prs).filter(p => p.state === 'OPEN')
  for (const p of open) {
    if (p.labels.includes('founder-click')) {
      items.push({ kind: 'founder-click', title: `#${p.number} ${p.title}`, url: p.url, where: where(p.number) })
    } else if (!p.isDraft && p.checks === 'passing') {
      items.push({ kind: 'merge', title: `#${p.number} ${p.title}`, url: p.url, where: where(p.number) })
    } else if (p.checks === 'failing' && owner.has(p.number)) {
      items.push({ kind: 'failing', title: `#${p.number} ${p.title}`, url: p.url, where: where(p.number) })
    }
  }

  // Two PRs naming the same issue: the later one is usually a lane redoing landed work.
  const byIssue = new Map<number, PrState[]>()
  for (const p of Object.values(input.prs)) {
    if (p.state === 'CLOSED') continue
    for (const ref of issueRefs(p.title)) byIssue.set(ref, [...(byIssue.get(ref) ?? []), p])
  }
  const flagged = new Set<number>()
  for (const [ref, list] of byIssue) {
    if (list.length < 2) continue
    for (const p of list) {
      if (p.state !== 'OPEN' || flagged.has(p.number)) continue
      const others = list.filter(o => o.number !== p.number).map(o => `#${o.number}${o.state === 'MERGED' ? ' (merged)' : ''}`)
      flagged.add(p.number)
      items.push({ kind: 'duplicate', title: `#${p.number} also fixes #${ref}, like ${others.join(', ')} — close one?`, url: p.url, where: where(p.number) })
    }
  }

  for (const d of input.decisions) {
    items.push({ kind: 'decision', title: `#${d.number} ${d.title}`, url: d.url, where: 'needs-decision' })
  }

  const order: WaitingItem['kind'][] = ['question', 'step', 'founder-click', 'duplicate', 'merge', 'failing', 'decision']
  return items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}

// ── The map ─────────────────────────────────────────────────────────────────

export type MapEvent = {
  at: number
  goalId: string
  isDetour: boolean
  icon: 'start' | 'step' | 'detour' | 'back' | 'pr-open' | 'pr-merged' | 'pr-closed' | 'question' | 'done'
  label: string
  meta: string
}

export type Lane = {
  goal: Goal
  sessions: SessionRecord[]
  events: MapEvent[]
  lastAt: number
  merged: number
  prTotal: number
  isLive: boolean
}

export function lanes(snap: Snapshot, now: number, showDone: boolean): Lane[] {
  const out: Lane[] = []
  for (const goal of snap.goals) {
    if (goal.doneAt && !showDone) continue
    const sessions = snap.sessions.filter(s => s.goalId === goal.id)
    const events: MapEvent[] = []
    let merged = 0
    let prTotal = 0
    for (const s of sessions) {
      const sid = s.id.slice(0, 8)
      let inDetour = false
      for (const step of s.steps) {
        if (step.kind === 'goal') {
          events.push({ at: step.at, goalId: goal.id, isDetour: false, icon: 'start', label: `session ${sid} on ${s.branch}`, meta: step.topic })
          inDetour = false
        } else if (step.kind === 'detour') {
          events.push({ at: step.at, goalId: goal.id, isDetour: true, icon: 'detour', label: `detour: ${step.topic}`, meta: sid })
          inDetour = true
        } else if (step.kind === 'back') {
          events.push({ at: step.at, goalId: goal.id, isDetour: false, icon: 'back', label: `back: ${step.topic}`, meta: sid })
          inDetour = false
        } else if (inDetour) {
          events.push({ at: step.at, goalId: goal.id, isDetour: true, icon: 'step', label: step.topic, meta: sid })
        }
      }
      for (const p of s.prs) {
        const pr = snap.prs[String(p.number)]
        prTotal++
        const state = pr?.state ?? 'OPEN'
        if (state === 'MERGED') merged++
        const status =
          state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : pr?.isDraft ? 'draft' : pr ? `CI ${pr.checks}` : 'open'
        events.push({
          at: p.at,
          goalId: goal.id,
          isDetour: false,
          icon: state === 'MERGED' ? 'pr-merged' : state === 'CLOSED' ? 'pr-closed' : 'pr-open',
          label: `#${p.number} ${pr ? pr.title : ''}`.trim(),
          meta: status,
        })
      }
      if (s.question && !s.isBackfilled) {
        events.push({ at: s.question.at, goalId: goal.id, isDetour: isInDetour(s.steps), icon: 'question', label: s.question.text, meta: 'waiting on you' })
      }
    }
    if (goal.doneAt) events.push({ at: goal.doneAt, goalId: goal.id, isDetour: false, icon: 'done', label: 'goal done', meta: '' })
    const lastAt = Math.max(goal.createdAt, ...events.map(e => e.at), ...sessions.map(s => s.lastActiveAt))
    if (!goal.doneAt && now - lastAt > ACTIVE_DAYS * DAY) continue
    const isLive = sessions.some(s => s.status !== 'ended' && !s.isBackfilled && now - s.lastActiveAt < QUIET_MS)
    out.push({ goal, sessions, events: events.sort((a, b) => b.at - a.at), lastAt, merged, prTotal, isLive })
  }
  return out.sort((a, b) => Number(b.isLive) - Number(a.isLive) || b.lastAt - a.lastAt)
}

const PALETTE = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#84cc16']

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * A GitKraken-style graph: one coloured column per goal, newest event on top,
 * detours forking into a side column and curving back.
 */
export function mapSvg(ls: Lane[], now: number, width = 820, maxRows = 60): { source: string; height: number } {
  const shown = ls.slice(0, PALETTE.length)
  const col = 26
  const rowH = 24
  const top = 14
  const graphW = shown.length * col * 2 + 8
  const rows: { e: MapEvent; lane: number }[] = []
  shown.forEach((l, i) => {
    for (const e of l.events) rows.push({ e, lane: i })
  })
  rows.sort((a, b) => b.e.at - a.e.at)
  const cut = rows.slice(0, maxRows)
  const height = top * 2 + Math.max(1, cut.length) * rowH
  const x = (lane: number, detour: boolean): number => 14 + lane * col * 2 + (detour ? col : 0)
  const y = (i: number): number => top + i * rowH + rowH / 2

  const parts: string[] = []
  parts.push(
    `<style>text{font:12px -apple-system,system-ui,sans-serif;fill:#1f2328}.dim{fill:#6e7781}.pill{font-weight:600;fill:#fff}` +
      `@media (prefers-color-scheme:dark){text{fill:#e6edf3}.dim{fill:#8b949e}.pill{fill:#0d1117}}</style>`,
  )

  // Goal lines from first to last row, and detour arcs.
  shown.forEach((l, i) => {
    const idx = cut.map((r, k) => (r.lane === i ? k : -1)).filter(k => k >= 0)
    if (idx.length === 0) return
    const c = PALETTE[i]
    const y1 = y(idx[0]!)
    const y2 = y(idx[idx.length - 1]!)
    parts.push(`<line x1="${x(i, false)}" y1="${y1}" x2="${x(i, false)}" y2="${y2}" stroke="${c}" stroke-width="2.5"/>`)
    // Detour runs: this lane's rows are newest first, so walk them oldest first.
    const asc: number[] = [...idx].reverse()
    const at = (n: number): number => asc[n]!
    const rowAt = (n: number): { e: MapEvent } => cut[at(n)]!
    let k = 0
    while (k < asc.length) {
      if (!rowAt(k).e.isDetour) {
        k++
        continue
      }
      let j = k
      while (j + 1 < asc.length && rowAt(j + 1).e.isDetour) j++
      const xa = x(i, false)
      const xb = x(i, true)
      const ys = y(at(k))
      const ye = y(at(j))
      const dash = `stroke="${c}" stroke-width="2" fill="none" stroke-dasharray="4 3"`
      parts.push(`<path d="M${xa},${ys + rowH * 0.6} C${xa},${ys} ${xb},${ys + rowH * 0.4} ${xb},${ys}" ${dash}/>`)
      if (ye !== ys) parts.push(`<line x1="${xb}" y1="${ys}" x2="${xb}" y2="${ye}" ${dash}/>`)
      if (j + 1 < asc.length) {
        const yn = y(at(j + 1))
        parts.push(`<path d="M${xb},${ye} C${xb},${ye - rowH * 0.4} ${xa},${yn + rowH * 0.4} ${xa},${yn}" ${dash}/>`)
      }
      k = j + 1
    }
  })

  const seenTip = new Set<number>()
  cut.forEach((r, k) => {
    const c = PALETTE[r.lane]
    const cx = x(r.lane, r.e.isDetour)
    const cy = y(k)
    const title = `<title>${esc(`${r.e.label} — ${r.e.meta}`)}</title>`
    switch (r.e.icon) {
      case 'pr-merged':
      case 'done':
        parts.push(`<g>${title}<circle cx="${cx}" cy="${cy}" r="7" fill="${c}"/><path d="M${cx - 3.5},${cy} l2.5,2.5 l4.5,-5" stroke="#fff" stroke-width="2" fill="none"/></g>`)
        break
      case 'pr-open':
        parts.push(`<g>${title}<circle cx="${cx}" cy="${cy}" r="6" fill="#fff" stroke="${c}" stroke-width="2.5"/></g>`)
        break
      case 'pr-closed':
        parts.push(`<g>${title}<circle cx="${cx}" cy="${cy}" r="6" fill="#fff" stroke="#8b949e" stroke-width="2"/><path d="M${cx - 3},${cy - 3} l6,6 M${cx + 3},${cy - 3} l-6,6" stroke="#8b949e" stroke-width="1.6"/></g>`)
        break
      case 'question':
        parts.push(`<g>${title}<rect x="${cx - 7}" y="${cy - 7}" width="14" height="14" rx="3" fill="#f97316"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" class="pill" style="fill:#fff">?</text></g>`)
        break
      case 'start':
        parts.push(`<g>${title}<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" fill="${c}" transform="rotate(45 ${cx} ${cy})"/></g>`)
        break
      default:
        parts.push(`<g>${title}<circle cx="${cx}" cy="${cy}" r="4" fill="${c}"/></g>`)
    }
    let tx = graphW + 6
    if (!seenTip.has(r.lane)) {
      seenTip.add(r.lane)
      const name = clip(shown[r.lane]!.goal.title, 34)
      const w = name.length * 6.6 + 14
      parts.push(`<rect x="${tx}" y="${cy - 9}" width="${w}" height="18" rx="9" fill="${c}"/><text x="${tx + 7}" y="${cy + 4}" class="pill">${esc(name)}</text>`)
      tx += w + 8
    }
    const room = Math.max(10, Math.floor((width - tx - 110) / 6.4))
    const lead = r.e.icon === 'question' ? 'WAITING: ' : ''
    parts.push(`<text x="${tx}" y="${cy + 4}">${esc(lead + clip(r.e.label, room))}</text>`)
    parts.push(`<text x="${width - 8}" y="${cy + 4}" text-anchor="end" class="dim">${esc(`${r.e.meta ? clip(r.e.meta, 16) + ' · ' : ''}${ago(r.e.at, now)}`)}</text>`)
  })

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`,
    height,
  }
}

/** The same map as text, for the terminal: one tree per goal. */
export function mapText(ls: Lane[], now: number, perLane = 8): string[] {
  const out: string[] = []
  for (const l of ls) {
    const live = l.isLive ? 'live' : 'quiet'
    const done = l.goal.doneAt ? ' ✓ done' : ''
    out.push(`● ${l.goal.title}${done}   ${l.sessions.length} session(s) · ${l.merged}/${l.prTotal} PRs merged · ${live} · ${ago(l.lastAt, now)}`)
    const evs = l.events.slice(0, perLane)
    evs.forEach((e, i) => {
      const glyph =
        e.icon === 'pr-merged' ? '✓' : e.icon === 'pr-open' ? '○' : e.icon === 'pr-closed' ? '✗' : e.icon === 'question' ? '?' : e.icon === 'detour' ? '↳' : e.icon === 'back' ? '↩' : e.icon === 'start' ? '◆' : '·'
      const branch = i === evs.length - 1 ? '└' : '├'
      const indent = e.isDetour ? '│  ┆ ' : `${branch}─ `
      out.push(`${indent}${glyph} ${clip(e.label, 70)}  (${e.meta ? e.meta + ', ' : ''}${ago(e.at, now)})`)
    })
    if (l.events.length > perLane) out.push(`   … ${l.events.length - perLane} more`)
    out.push('')
  }
  return out
}

/** The status line: the goal, any detour, and how much is waiting on you. */
export function statusLine(goal: Goal | null, steps: Step[], waiting: number): string {
  const tail = waiting > 0 ? ` · ⚑ ${waiting} need you` : ''
  if (!goal) return `◎ No goal yet · /goal <title> names it${tail}`
  const last = [...steps].reverse().find(s => s.kind === 'detour')
  if (isInDetour(steps) && last) return `◎ ${clip(goal.title, 30)} ↳ detour: ${clip(last.topic, 24)}${tail}`
  return `◎ ${clip(goal.title, 40)}${tail}`
}

/** The unticked `@me` steps under a goal's heading in TASKS.md (archive-ready reads the same file). */
export function myOpenSteps(md: string, goal: string): string[] {
  const want = goal.trim().toLowerCase()
  const goalWords = new Set(want.split(/[^a-z0-9]+/).filter(w => w.length > 2))
  const sections: { title: string; lines: string[] }[] = []
  for (const line of md.split('\n')) {
    const head = line.match(/^#{1,3}\s+(.+?)\s*$/)
    if (head) sections.push({ title: head[1]!.trim(), lines: [] })
    else if (sections.length === 0) sections.push({ title: '', lines: [line] })
    else sections[sections.length - 1]!.lines.push(line)
  }
  const score = (title: string): number => {
    if (title === '' && sections.length === 1) return 1
    if (title.toLowerCase() === want) return 2
    const w = title.toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 2)
    const shared = w.filter(x => goalWords.has(x)).length
    return shared / Math.max(1, Math.min(w.length, goalWords.size))
  }
  const best = [...sections].sort((a, b) => score(b.title) - score(a.title))[0]
  if (!best || score(best.title) < 0.5) return []
  return best.lines
    .map(l => l.match(/^\s*[-*] \[ \]\s+@me\s+(.*)$/i)?.[1]?.trim())
    .filter((x): x is string => Boolean(x))
}
