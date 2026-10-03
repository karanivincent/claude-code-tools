import type { EngineInterface, Register } from 'claude-code'

import type { Goal, PrState, SessionRecord, Snapshot, Step } from '../types'
import {
  DAY,
  checksOf,
  classifierPrompt,
  clip,
  isInDetour,
  isTrivialPrompt,
  lanes,
  mapSvg,
  mapText,
  parseClassification,
  prNumbersIn,
  slug,
  trailingQuestion,
  waitingItems,
} from './lib'

// Every session that loads this mod writes its own file under ~/.claude/goal-map/sessions/,
// so any one session can draw the whole picture without asking the others.

const PANE = 'goal-map'
const MODEL = 'claude-haiku-4-5-20251001'
const KEEP_DAYS = 14

const SNAPSHOT = { plugin: 'goal-map', key: 'snapshot' } as const
const VIEW = { plugin: 'goal-map', key: 'view' } as const
const SHOW_DONE = { plugin: 'goal-map', key: 'showDone' } as const

type Dollar = EngineInterface

let root = ''
let me: SessionRecord | null = null
let refreshing: Promise<void> | null = null

const sessionsDir = (): string => `${root}/sessions`
const goalsDir = (): string => `${root}/goals`

async function readJson<T>($: Dollar, path: string): Promise<T | null> {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return null
  }
}

async function loadAll($: Dollar): Promise<{ goals: Goal[]; sessions: SessionRecord[] }> {
  const now = await $.clock.now()
  const goals: Goal[] = []
  const sessions: SessionRecord[] = []
  for (const [dir, into] of [
    [goalsDir(), goals],
    [sessionsDir(), sessions],
  ] as const) {
    let entries: { name: string; mtimeMs: number }[] = []
    try {
      entries = await $.fs.list(dir)
    } catch {
      continue
    }
    for (const f of entries) {
      if (!f.name.endsWith('.json')) continue
      if (dir === sessionsDir() && now - f.mtimeMs > KEEP_DAYS * DAY) continue
      const v = await readJson<Goal & SessionRecord>($, `${dir}/${f.name}`)
      if (v) (into as unknown[]).push(v)
    }
  }
  return { goals, sessions }
}

async function saveMe($: Dollar): Promise<void> {
  if (!me) return
  me.lastActiveAt = await $.clock.now()
  await $.fs.write(`${sessionsDir()}/${me.id}.json`, JSON.stringify(me, null, 1))
}

async function saveGoal($: Dollar, goal: Goal): Promise<void> {
  await $.fs.write(`${goalsDir()}/${goal.id}.json`, JSON.stringify(goal, null, 1))
}

async function gh($: Dollar, args: string[]): Promise<unknown> {
  const r = await $.process.run(['gh', ...args], { cwd: me?.cwd, timeoutMs: 30000 })
  if (r.exitCode !== 0) throw new Error(clip(r.stderr || `gh ${args[0]} failed`, 160))
  return JSON.parse(r.stdout)
}

async function refresh($: Dollar): Promise<void> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const { goals, sessions } = await loadAll($)
    const now = await $.clock.now()
    const prs: Record<string, PrState> = {}
    let decisions: { number: number; title: string; url: string }[] = []
    let error: string | null = null
    const toState = (p: Record<string, unknown>): PrState => ({
      number: p.number as number,
      title: p.title as string,
      state: p.state as PrState['state'],
      isDraft: Boolean(p.isDraft),
      checks: checksOf(p.statusCheckRollup),
      url: p.url as string,
      labels: ((p.labels as { name: string }[]) ?? []).map(l => l.name),
      updatedAt: p.updatedAt as string,
    })
    const fields = 'number,title,state,isDraft,url,labels,updatedAt,statusCheckRollup'
    try {
      const open = (await gh($, ['pr', 'list', '--state', 'open', '--limit', '100', '--json', fields])) as Record<string, unknown>[]
      for (const p of open) prs[String(p.number)] = toState(p)
      // Merged PRs, so a duplicate of landed work is visible.
      const recent = (await gh($, ['pr', 'list', '--state', 'merged', '--limit', '60', '--json', fields])) as Record<string, unknown>[]
      for (const p of recent) prs[String(p.number)] = toState(p)
      // The rest of the PRs our sessions own; a merged one never changes, so it is cached.
      const cache = ((await $.store.get('prs')) as Record<string, PrState> | undefined) ?? {}
      const owned = [...new Set(sessions.flatMap(s => s.prs.map(p => p.number)))].filter(n => !prs[String(n)])
      for (const n of owned.slice(0, 25)) {
        const hit = cache[String(n)]
        if (hit && hit.state !== 'OPEN') {
          prs[String(n)] = hit
          continue
        }
        try {
          prs[String(n)] = toState((await gh($, ['pr', 'view', String(n), '--json', fields])) as Record<string, unknown>)
        } catch {
          // A PR in another repo, or deleted: leave it unknown.
        }
      }
      const keep: Record<string, PrState> = {}
      for (const [k, v] of Object.entries(prs)) if (v.state !== 'OPEN') keep[k] = v
      await $.store.set('prs', { ...cache, ...keep })
      decisions = (await gh($, ['issue', 'list', '--label', 'needs-decision', '--state', 'open', '--limit', '30', '--json', 'number,title,url'])) as typeof decisions
    } catch (err) {
      error = `GitHub: ${(err as Error).message}`
    }
    const snap: Snapshot = {
      goals,
      sessions,
      prs,
      waiting: waitingItems({ sessions, goals, prs, decisions, now }),
      refreshedAt: now,
      error,
    }
    await $.state.set(SNAPSHOT, snap)
    await showStatus($)
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function goalOf($: Dollar): Promise<Goal | null> {
  if (!me?.goalId) return null
  return readJson<Goal>($, `${goalsDir()}/${me.goalId}.json`)
}

// The goal shows in archive-ready's line above the prompt, which reads our session file,
// so this mod keeps no status line of its own.
async function showStatus($: Dollar): Promise<void> {
  $.ui.status(undefined)
}

async function newGoal($: Dollar, title: string): Promise<Goal> {
  const now = await $.clock.now()
  const goal: Goal = { id: `${slug(title)}-${now.toString(36).slice(-4)}`, title: clip(title, 60), createdAt: now, doneAt: null }
  await saveGoal($, goal)
  return goal
}

async function classify($: Dollar, text: string): Promise<void> {
  if (!me) return
  const now = await $.clock.now()
  const { goals } = await loadAll($)
  const openGoals = goals.filter(g => !g.doneAt).sort((a, b) => b.createdAt - a.createdAt)
  const current = goals.find(g => g.id === me?.goalId) ?? null
  let sessionStart: string | undefined
  if (!current) {
    const history = await $.session.messages()
    const earlier = history
      .filter(m => m.role === 'user' && m.text && !/^<(system-reminder|command-|task-notification|local-command)/.test(m.text))
      .map(m => m.text.replace(/<\/?pasted_content[^>]*>/g, ''))
    if (earlier.length > 1) sessionStart = earlier.slice(0, 3).join('\n---\n')
  }
  const r = await $.model.complete({
    model: MODEL,
    maxTokens: 200,
    timeoutMs: 20000,
    prompt: classifierPrompt({ prompt: text, current, recent: me.steps, isInDetour: isInDetour(me.steps), openGoals, sessionStart }),
  })
  if (!r.isAnswered) return
  const c = parseClassification(r.text, Boolean(current))
  if (!c) return
  if (c.kind === 'goal') {
    const known = c.goalId ? goals.find(g => g.id === c.goalId) : undefined
    const goal = known ?? (await newGoal($, c.newGoalTitle || c.topic || clip(text, 50)))
    me.goalId = goal.id
  }
  if (c.kind === 'detour' && !isInDetour(me.steps) && current) {
    $.ui.toast(`Detour from "${clip(current.title, 40)}": ${c.topic}. /goal-map shows where you are.`)
  }
  const step: Step = { at: now, kind: c.kind === 'back' && !isInDetour(me.steps) ? 'continue' : c.kind, topic: c.topic, text: clip(text, 160) }
  me.steps = [...me.steps, step].slice(-200)
  await saveMe($)
  await showStatus($)
  void refresh($)
}

async function backfill($: Dollar, days: number): Promise<void> {
  const r = await $.process.run(['node', `${$.plugin.root}/scripts/backfill.mjs`, String(days)], { timeoutMs: 120000 })
  if (r.exitCode !== 0) {
    $.ui.toast(`Backfill failed: ${clip(r.stderr, 120)}`)
    return
  }
  const found = JSON.parse(r.stdout) as {
    id: string
    cwd: string
    branch: string
    startedAt: number
    lastActiveAt: number
    prompts: { at: number; text: string }[]
    prs: { number: number; at: number }[]
  }[]
  let added = 0
  for (const s of found) {
    if (s.id === me?.id) continue
    if (await $.fs.exists(`${sessionsDir()}/${s.id}.json`)) continue
    const { goals } = await loadAll($)
    const list = s.prompts.slice(0, 30).map((p, i) => `${i}. ${clip(p.text, 220)}`).join('\n')
    const open = goals.filter(g => !g.doneAt).slice(0, 25).map(g => `- ${g.id}: ${g.title}`).join('\n') || '(none)'
    const answer = await $.model.complete({
      model: MODEL,
      maxTokens: 900,
      timeoutMs: 40000,
      prompt: [
        'These are the prompts a founder typed into one Claude Code session, in order.',
        'Return one JSON object and nothing else:',
        '{"goalId": string | null, "newGoalTitle": string | null, "steps": [{"i": number, "kind": "goal"|"continue"|"detour"|"back", "topic": string}]}',
        'goalId: an id from OPEN GOALS when the session clearly worked on that goal, else null with newGoalTitle a 3-7 word outcome title.',
        'steps: the first prompt is "goal"; then list ONLY prompts that are "detour" (side task the goal did not need) or "back" (returning to the goal). topic: 2-6 words.',
        `Branch: ${s.branch}`,
        'OPEN GOALS:',
        open,
        'PROMPTS:',
        list,
      ].join('\n'),
    })
    if (!answer.isAnswered) continue
    const m = answer.text.match(/\{[\s\S]*\}/)
    if (!m) continue
    let parsed: { goalId?: string | null; newGoalTitle?: string | null; steps?: { i: number; kind: Step['kind']; topic: string }[] }
    try {
      parsed = JSON.parse(m[0])
    } catch {
      continue
    }
    const known = parsed.goalId ? goals.find(g => g.id === parsed.goalId) : undefined
    const goal = known ?? (await newGoal($, parsed.newGoalTitle || clip(s.prompts[0]?.text ?? s.branch, 50)))
    if (!known) await saveGoal($, { ...goal, createdAt: s.startedAt })
    const steps: Step[] = (parsed.steps ?? [])
      .filter(x => s.prompts[x.i])
      .map(x => ({ at: s.prompts[x.i]!.at, kind: x.kind, topic: clip(x.topic ?? '', 50), text: clip(s.prompts[x.i]!.text, 160) }))
    if (!steps.some(x => x.kind === 'goal') && s.prompts[0]) {
      steps.unshift({ at: s.prompts[0].at, kind: 'goal', topic: goal.title, text: clip(s.prompts[0].text, 160) })
    }
    const rec: SessionRecord = {
      id: s.id,
      cwd: s.cwd,
      branch: s.branch,
      goalId: goal.id,
      startedAt: s.startedAt,
      lastActiveAt: s.lastActiveAt,
      status: 'ended',
      steps: steps.sort((a, b) => a.at - b.at),
      prs: s.prs,
      question: null,
      isBackfilled: true,
    }
    await $.fs.write(`${sessionsDir()}/${s.id}.json`, JSON.stringify(rec, null, 1))
    added++
    if (added % 3 === 0) void refresh($)
  }
  await refresh($)
  $.ui.toast(`Backfill: ${added} session(s) added to the goal map.`)
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
    root = `${home}/.claude/goal-map`
    const id = await $.session.id()
    const cwd = await $.session.cwd()
    const branch = (await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd })).stdout.trim()
    const now = await $.clock.now()
    me = (await readJson<SessionRecord>($, `${sessionsDir()}/${id}.json`)) ?? {
      id,
      cwd,
      branch,
      goalId: null,
      startedAt: now,
      lastActiveAt: now,
      status: 'idle',
      steps: [],
      prs: [],
      question: null,
    }
    me.cwd = cwd
    me.branch = branch || me.branch
    me.status = 'idle'
    if (me.steps.length > 0) await saveMe($)

    for (const [name, description] of [
      ['goal-map', 'Open the map of goals, detours, PRs and what is waiting on you'],
      ['goal', 'Name or rename this session\'s goal: /goal <title>'],
      ['goal-done', 'Mark this session\'s goal done'],
      ['goal-map-backfill', 'Import the last N days of sessions into the map: /goal-map-backfill [days]'],
    ] as const) {
      await $.command.register({ name, description })
    }
    await showStatus($)
    void $.clock.every(120000, () => refresh($))
    return next(e)
  })

  on('command.run', { command: 'goal-map' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Goal map' })
    void refresh($)
    return { text: 'Goal map opened.' }
  })

  on('command.run', { command: 'goal' }, async ($, e) => {
    if (!me) return { text: 'goal-map has not started yet.' }
    const title = e.args.trim()
    if (!title) {
      const g = await goalOf($)
      return { text: g ? `This session's goal: ${g.title}` : 'No goal yet. /goal <title> names one.' }
    }
    const now = await $.clock.now()
    const g = await goalOf($)
    if (g) {
      await saveGoal($, { ...g, title: clip(title, 60) })
    } else {
      me.goalId = (await newGoal($, title)).id
      me.steps = [...me.steps, { at: now, kind: 'goal', topic: clip(title, 50), text: title }]
    }
    await saveMe($)
    await showStatus($)
    void refresh($)
    return { text: `Goal: ${title}` }
  })

  on('command.run', { command: 'goal-done' }, async $ => {
    const g = await goalOf($)
    if (!g) return { text: 'This session has no goal to finish.' }
    await saveGoal($, { ...g, doneAt: await $.clock.now() })
    void refresh($)
    return { text: `Done: ${g.title}` }
  })

  on('command.run', { command: 'goal-map-backfill' }, async ($, e) => {
    const days = Number(e.args.trim()) || 7
    void backfill($, days)
    return { text: `Importing the last ${days} days of sessions in the background; the map fills as each one lands.` }
  })

  on('prompt.submit', async ($, e, next) => {
    if (me && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
      me.status = 'working'
      me.question = null
      if (isTrivialPrompt(e.text)) {
        if (me.steps.length > 0) {
          me.steps = [...me.steps, { at: await $.clock.now(), kind: 'continue' as const, topic: clip(e.text, 30), text: clip(e.text, 160) }].slice(-200)
        }
        void saveMe($)
      } else {
        void classify($, e.text).catch(() => undefined)
      }
    }
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const q = (e as unknown as { questions?: { question?: string }[] }).questions?.[0]?.question
    if (me && q) {
      me.question = { text: clip(q, 140), at: await $.clock.now() }
      await saveMe($)
      void refresh($)
    }
    const r = await next(e)
    if (me) {
      me.question = null
      void saveMe($)
    }
    return r
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    const command = (e as unknown as { command?: string }).command ?? ''
    if (me && /\bgh\s+pr\s+(create|merge|ready)\b/.test(command)) {
      const out = (r as unknown as { result?: { stdout?: string } }).result?.stdout ?? ''
      const now = await $.clock.now()
      for (const n of prNumbersIn(command, out)) {
        if (!me.prs.some(p => p.number === n)) me.prs = [...me.prs, { number: n, at: now }]
      }
      await saveMe($)
      void refresh($)
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    if (me && !e.agentId) {
      me.status = 'idle'
      const text = (e as unknown as { text?: string }).text ?? ''
      const q = trailingQuestion(text)
      if (q) me.question = { text: q, at: await $.clock.now() }
      if (me.steps.length > 0 || me.question) await saveMe($)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (me && me.steps.length > 0) {
      me.status = 'ended'
      await saveMe($)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const snap = (await $.state.get(SNAPSHOT)).value ?? null
    const which = (await $.state.get(VIEW)).value ?? 'map'
    const withDone = (await $.state.get(SHOW_DONE)).value ?? false
    const now = await $.clock.now()
    if (!snap) return <Text dimColor>Reading sessions and GitHub…</Text>

    const ls = lanes(snap, now, withDone)
    const waiting = snap.waiting
    const width = Math.max(480, Math.min(1100, ((e.viewport?.columns ?? 100) - 2) * 8))

    const header = (
      <Box flexDirection="row" gap={1}>
        <Button key="map" label={`Map (${ls.length})`} onPress={() => $.state.set(VIEW, 'map')} />
        <Button key="waiting" label={`Waiting on you (${waiting.length})`} onPress={() => $.state.set(VIEW, 'waiting')} />
        <Button key="done" label={withDone ? 'Hide done' : 'Show done'} onPress={() => $.state.set(SHOW_DONE, !withDone)} />
        <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
      </Box>
    )

    const waitingList = (
      <Box flexDirection="column">
        {waiting.length === 0 && <Text dimColor>Nothing is waiting on you.</Text>}
        {waiting.slice(0, 40).map(w => (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color={w.kind === 'question' ? 'yellow' : w.kind === 'duplicate' || w.kind === 'failing' ? 'red' : undefined}>
              {LABEL[w.kind]} {w.url ? '' : w.title}
            </Text>
            {w.url && <Link href={w.url} label={clip(w.title, 110)} />}
            <Text dimColor>{w.where}</Text>
          </Box>
        ))}
      </Box>
    )

    let body
    if (which === 'waiting') {
      body = waitingList
    } else if (ls.length === 0) {
      body = <Text dimColor>No goals in the last week. They appear as sessions start; /goal-map-backfill imports past ones.</Text>
    } else if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
      const drawn = mapSvg(ls, now, width)
      body = (
        <Box flexDirection="column">
          {waiting.length > 0 && (
            <Text color="yellow" bold>
              {waiting.length} thing(s) waiting on you — {summary(waiting)}
            </Text>
          )}
          <Svg source={drawn.source} alt={mapText(ls, now).join('\n')} width={width} height={drawn.height} isInteractive />
          <Text dimColor>◆ session started · ○ PR open · ✓ PR merged · ✗ closed · ? waiting on you · dashed = detour. Hover a dot for detail.</Text>
        </Box>
      )
    } else {
      body = (
        <Box flexDirection="column">
          {waiting.length > 0 && (
            <Text color="yellow" bold>
              {waiting.length} thing(s) waiting on you — {summary(waiting)}
            </Text>
          )}
          {mapText(ls, now).map(line => (
            <Text wrap="truncate">{line || ' '}</Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {snap.error && <Text color="red">{snap.error}</Text>}
        {body}
      </Box>
    )
  })
}

const LABEL: Record<string, string> = {
  question: '? A session asked you:',
  'founder-click': 'Your merge:',
  duplicate: 'Duplicate?',
  merge: 'Ready to merge:',
  failing: 'CI failing on your PR:',
  decision: 'Decision owed:',
}

function summary(w: { kind: string }[]): string {
  const counts = new Map<string, number>()
  for (const x of w) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1)
  const names: Record<string, string> = {
    question: 'questions',
    'founder-click': 'your merges',
    duplicate: 'duplicates',
    merge: 'ready to merge',
    failing: 'failing CI',
    decision: 'decisions',
  }
  return [...counts].map(([k, n]) => `${n} ${names[k] ?? k}`).join(', ')
}
