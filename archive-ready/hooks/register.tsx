import type { EngineInterface, Register } from 'claude-code'

import type { Board, PrLabel, Verdict } from '../types'
import { parseTasks, progress, sectionFor } from './tasks'

const REF = { plugin: 'archive-ready', key: 'verdict' } as const
const SHOW = { plugin: 'archive-ready', key: 'showQuestions' } as const
const EXPANDED = { plugin: 'archive-ready', key: 'expanded' } as const
const PRS = { plugin: 'archive-ready', key: 'prs' } as const
/** A goal-map session that has not written for this long no longer counts as live. */
const LIVE_MS = 6 * 60 * 60 * 1000

// Phrases that mean the reply handed the next move back to the person.
const HANDOFF = /\b(shall i|should i|want me to|would you like|let me know|which (one|option)|do you want|can you (confirm|check|run|send))\b/i

// What the last turn left behind. Resets on reload, which is fine.
let lastAnswer = ''
let lastReason = 'answer'
let askedQuestions: string[] = []
let backgroundShells = 0

async function git($: EngineInterface, cwd: string, args: string[]) {
  try {
    return await $.process.run(['git', ...args], { cwd, timeoutMs: 5000 })
  } catch {
    return { exitCode: 1, stdout: '', stderr: '' }
  }
}

async function check($: EngineInterface): Promise<Verdict> {
  const reasons: string[] = []
  const cwd = await $.session.cwd()

  // 1. The conversation itself.
  if (lastReason === 'aborted') reasons.push('Last turn was interrupted mid-way')
  if (lastReason === 'error' || lastReason === 'refusal') reasons.push('Last turn ended in an error')
  const questions = [...askedQuestions, ...questionsIn(lastAnswer)]
  if (questions.length > 0) {
    reasons.push(`${questions.length} question(s) waiting for you`)
  } else {
    const tail = lastAnswer.trim().split(/\n\s*\n/).pop() ?? ''
    if (HANDOFF.test(tail)) reasons.push('Claude is waiting for your answer')
  }

  // 2. Work still running.
  try {
    const running = (await $.agent.list()).filter(a => /running|pending/i.test(a.status))
    if (running.length > 0) reasons.push(`${running.length} subagent(s) still running`)
  } catch {}
  if (backgroundShells > 0) reasons.push(`${backgroundShells} background command(s) may still be running`)

  // 3. Work not saved anywhere but this machine.
  const inRepo = (await git($, cwd, ['rev-parse', '--is-inside-work-tree'])).exitCode === 0
  if (inRepo) {
    const dirty = (await git($, cwd, ['status', '--porcelain', '--untracked-files=no'])).stdout.trim()
    if (dirty) reasons.push(`${dirty.split('\n').length} uncommitted file(s)`)
    const ahead = await git($, cwd, ['rev-list', '--count', '@{u}..HEAD'])
    if (ahead.exitCode === 0 && Number(ahead.stdout.trim()) > 0) {
      reasons.push(`${ahead.stdout.trim()} commit(s) not pushed`)
    }
  }

  // 4. This goal's checklist. Steps under other goals' headings never block this session.
  const board = await boardFor($, cwd)
  if (board.section) {
    const open = board.section.steps.filter(x => !x.isDone).length
    if (open > 0) reasons.push(`${open} unticked step(s) in TASKS.md`)
  }

  return { isReady: reasons.length === 0, reasons, questions, checkedAt: await $.clock.now(), board }
}

// Sentences in the reply that end in a question mark, outside code.
function questionsIn(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, m => m.replace(/[?]/g, ""))
  const found: string[] = []
  for (const line of prose.split('\n')) {
    const clean = line.replace(/^\s*([-*>]|\d+\.)\s*/, '').trim()
    for (const m of clean.match(/[^.!?]*\?/g) ?? []) {
      const q = m.trim()
      if (q.length > 3) found.push(q)
    }
  }
  return found
}

type GoalMapSession = {
  id: string
  cwd: string
  goalId: string | null
  status: string
  lastActiveAt: number
  steps: { kind: string; topic: string }[]
}

async function readJson<T>($: EngineInterface, path: string): Promise<T | null> {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return null
  }
}

async function sectionsAt($: EngineInterface, cwd: string) {
  try {
    return parseTasks(await $.fs.read(`${cwd}/TASKS.md`))
  } catch {
    return []
  }
}

function openDetour(steps: { kind: string; topic: string }[]): string | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!
    if (step.kind === 'detour') return step.topic
    if (step.kind === 'back' || step.kind === 'goal') return null
  }
  return null
}

// The goal-map mod keeps each session's goal under ~/.claude/goal-map; this reads it,
// then the matching heading of TASKS.md, then the other live sessions' goals.
async function boardFor($: EngineInterface, cwd: string): Promise<Board> {
  const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
  const root = `${home}/.claude/goal-map`
  const id = await $.session.id()
  const me = await readJson<GoalMapSession>($, `${root}/sessions/${id}.json`)
  const goal = me?.goalId ? await readJson<{ title: string }>($, `${root}/goals/${me.goalId}.json`) : null
  const section = sectionFor(await sectionsAt($, cwd), goal?.title ?? null)

  const others = new Map<string, { title: string; sessions: number; done: number; total: number }>()
  const now = await $.clock.now()
  try {
    for (const f of await $.fs.list(`${root}/sessions`)) {
      if (!f.name.endsWith('.json') || now - f.mtimeMs > LIVE_MS) continue
      const s = await readJson<GoalMapSession>($, `${root}/sessions/${f.name}`)
      if (!s || s.id === id || !s.goalId || s.goalId === me?.goalId || s.status === 'ended') continue
      const g = await readJson<{ title: string; doneAt: number | null }>($, `${root}/goals/${s.goalId}.json`)
      if (!g || g.doneAt) continue
      const entry = others.get(s.goalId) ?? { title: g.title, sessions: 0, done: 0, total: 0 }
      entry.sessions++
      const sec = sectionFor(await sectionsAt($, s.cwd), g.title)
      if (sec && entry.total === 0) {
        const p = progress(sec)
        entry.done = p.done
        entry.total = p.total
      }
      others.set(s.goalId, entry)
    }
  } catch {}

  return {
    goal: goal?.title ?? null,
    detour: me ? openDetour(me.steps) : null,
    section,
    others: [...others.values()].map(
      o => `${o.title} (${o.sessions} session${o.sessions === 1 ? '' : 's'}${o.total ? `, ${o.done}/${o.total}` : ''})`,
    ),
  }
}

// The live state of the PRs this goal's steps name, for the expanded view.
async function refreshPrs($: EngineInterface, cwd: string, refs: string[]): Promise<void> {
  const labels: Record<string, PrLabel> = { ...((await $.state.get(PRS)).value ?? {}) }
  for (const n of refs.slice(0, 10)) {
    if (labels[n]?.text === 'merged') continue
    const [repo, num] = n.includes('#') ? n.split('#') : [null, n]
    try {
      const args = ['gh', 'pr', 'view', num!, '--json', 'state,isDraft,statusCheckRollup', ...(repo ? ['--repo', repo] : [])]
      const r = await $.process.run(args, { cwd, timeoutMs: 15000 })
      if (r.exitCode !== 0) continue
      const pr = JSON.parse(r.stdout) as { state: string; isDraft: boolean; statusCheckRollup?: { conclusion?: string; state?: string }[] }
      const failing = (pr.statusCheckRollup ?? []).some(c => /FAILURE|ERROR|TIMED_OUT/.test(`${c.conclusion ?? ''}${c.state ?? ''}`))
      labels[n] =
        pr.state === 'MERGED' ? { text: 'merged', tone: 'ok' }
        : pr.state === 'CLOSED' ? { text: 'closed', tone: 'bad' }
        : failing ? { text: 'CI failing', tone: 'bad' }
        : { text: pr.isDraft ? 'draft' : 'open', tone: 'open' }
    } catch {}
  }
  await $.state.set(PRS, labels)
}

function contextLabel(tokens: number | undefined, window: number, percent: number | undefined) {
  const pct = percent ?? (tokens !== undefined && window > 0 ? (tokens / window) * 100 : undefined)
  if (pct === undefined) return 'Context —'
  const k = tokens !== undefined ? ` (${Math.round(tokens / 1000)}k/${Math.round(window / 1000)}k)` : ''
  return `Context ${Math.round(pct)}%${k}`
}

function statusText(v: Verdict) {
  return v.isReady ? '✓ ready to archive' : `✗ not ready: ${v.reasons[0]}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'archive-check',
      description: 'Say whether this session is ready to archive, and why not',
    })
    const ran = await next(e)
    const v = await check($)
    await $.state.set(REF, v)
    $.ui.status(statusText(v))
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'task-notification' && backgroundShells > 0) backgroundShells -= 1
    askedQuestions = []
    await $.state.set(SHOW, false)
    $.ui.status('Running')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as { run_in_background?: boolean; questions?: { question?: string }[] }
    if (e.tool === 'AskUserQuestion') {
      askedQuestions = (input.questions ?? []).map(q => q.question ?? '').filter(Boolean)
    }
    if ((e.tool === 'Bash' || e.tool === 'Monitor') && input.run_in_background) backgroundShells += 1
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId) return ran // a subagent's turn, not the conversation's
    lastAnswer = e.answer
    lastReason = e.reason
    const v = await check($)
    await $.state.set(REF, v)
    const prNumbers = [...new Set(v.board.section?.steps.flatMap(x => x.prs) ?? [])]
    if (prNumbers.length > 0) void refreshPrs($, await $.session.cwd(), prNumbers)
    $.ui.status(statusText(v))
    return ran
  })

  on('command.run', { command: 'archive-check' }, async $ => {
    const v = await check($)
    await $.state.set(REF, v)
    $.ui.status(statusText(v))
    return {
      text: v.isReady
        ? '✓ Ready to archive. Nothing open.'
        : `✗ Not ready to archive:\n${v.reasons.map(r => `  • ${r}`).join('\n')}` +
          (v.questions.length > 0 ? `\n\nQuestions:\n${v.questions.map(q => `  • ${q}`).join('\n')}` : ''),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const usage = await $.session.usage()
    const ctx = contextLabel(usage.context.tokens, usage.context.window, usage.context.percent)
    const v = (await $.state.get(REF)).value ?? null
    const board = v?.board ?? null
    const isOpen = (await $.state.get(EXPANDED)).value ?? false
    const prs = (await $.state.get(PRS)).value ?? {}
    const section = board?.section ?? null
    const p = section ? progress(section) : null

    const goal = board?.goal ? (
      <Text color="magenta">
        ◎ {board.goal}
        {board.detour ? ` ↳ detour: ${board.detour}` : ''}
      </Text>
    ) : null
    const toggle = p ? (
      <Button key="steps" label={`${isOpen ? '▾' : '▸'} ${p.done}/${p.total}`} onPress={() => $.state.set(EXPANDED, !isOpen)} />
    ) : null
    const allMerged = section ? section.steps.flatMap(x => x.prs).every(n => prs[n]?.text === 'merged') : false
    const isGoalDone = p !== null && p.total > 0 && p.done === p.total && allMerged
    const next_ = p?.openDetour ? (
      <Text dimColor>  {p.openDetour.open} step{p.openDetour.open === 1 ? '' : 's'} on the detour</Text>
    ) : isGoalDone ? (
      <Text color="green">  ✓ Goal done? /goal-done</Text>
    ) : p?.next ? (
      <Text>
        {'  next: '}
        {p.next.isMine ? <Text color="yellow">you </Text> : null}
        {p.next.text}
      </Text>
    ) : null

    const state = e.props.isWorking ? (
      <Text color="cyan">Running</Text>
    ) : v === null ? null : v.isReady ? (
      <Text color="green">✓ Ready</Text>
    ) : (
      <Text color="yellow">✗ Not ready</Text>
    )

    // Two lines: the session's state on top, the goal it serves underneath.
    const line = (
      <Box flexDirection="column">
        <Box>
          {state}
          {state ? <Text dimColor>{'  ·  '}</Text> : null}
          <Text dimColor>{ctx}</Text>
        </Box>
        {goal ? (
          <Box>
            {goal}
            {toggle ? <Text> </Text> : null}
            {toggle}
            {isOpen ? null : next_}
          </Box>
        ) : null}
      </Box>
    )
    if (!isOpen || !section) return line

    return (
      <Box flexDirection="column">
        {line}
        {section.steps.map((step, i) => {
          const pad = '  '.repeat(step.depth)
          const pr = step.prs.map(n => prs[n]).find(Boolean)
          const isNext = p?.next === step
          if (step.isDetour) {
            return <Text key={`s${i}`} dimColor>{`  ${pad}┆ ↳ detour: ${step.text}`}{step.isDone ? '  ✓' : ''}</Text>
          }
          return (
            <Box key={`s${i}`}>
              <Text color={step.isDone ? 'green' : isNext ? 'yellow' : undefined}>{`  ${pad}${step.isDone ? '✓' : isNext ? '▶' : '○'} `}</Text>
              {step.isMine ? <Text color="yellow">you </Text> : null}
              <Text dimColor={step.isDone}>{step.text}</Text>
              {pr ? <Text color={pr.tone === 'ok' ? 'green' : pr.tone === 'bad' ? 'red' : undefined} dimColor={pr.tone === 'open'}>{`   ${pr.text}`}</Text> : null}
              {step.isMine && !step.isDone ? <Text color="yellow">   waiting on you</Text> : null}
            </Box>
          )
        })}
        {board && board.others.length > 0 ? <Text dimColor>{`  other goals: ${board.others.join(' · ')}`}</Text> : null}
      </Box>
    )
  })
}
