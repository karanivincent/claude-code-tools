import type { EngineInterface, Register } from 'claude-code'

import type { Verdict } from '../types'

const REF = { plugin: 'archive-ready', key: 'verdict' } as const
const SHOW = { plugin: 'archive-ready', key: 'showQuestions' } as const

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

  // 4. The checklist.
  try {
    const tasks = await $.fs.read(`${cwd}/TASKS.md`)
    const open = (typeof tasks === 'string' ? tasks : String(tasks)).match(/^\s*[-*] \[ \]/gm)
    if (open && open.length > 0) reasons.push(`${open.length} unticked item(s) in TASKS.md`)
  } catch {}

  return { isReady: reasons.length === 0, reasons, questions, checkedAt: await $.clock.now() }
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

// The goal-map mod keeps each session's goal under ~/.claude/goal-map; show it here when it exists.
async function goalText($: EngineInterface): Promise<string | null> {
  try {
    const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
    const id = await $.session.id()
    const rec = JSON.parse(await $.fs.read(`${home}/.claude/goal-map/sessions/${id}.json`)) as {
      goalId: string | null
      steps: { kind: string; topic: string }[]
    }
    if (!rec.goalId) return null
    const goal = JSON.parse(await $.fs.read(`${home}/.claude/goal-map/goals/${rec.goalId}.json`)) as { title: string }
    let detour: string | null = null
    for (let i = rec.steps.length - 1; i >= 0; i--) {
      const step = rec.steps[i]!
      if (step.kind === 'detour') { detour = step.topic; break }
      if (step.kind === 'back' || step.kind === 'goal') break
    }
    return detour ? `◎ ${goal.title} ↳ detour: ${detour}` : `◎ ${goal.title}`
  } catch {
    return null
  }
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
    const { Box, Text } = $.ui.resolve(e)
    const usage = await $.session.usage()
    const ctx = contextLabel(usage.context.tokens, usage.context.window, usage.context.percent)
    const goal = await goalText($)
    const goalPart = goal ? <Text color="magenta">  ·  {goal}</Text> : null

    if (e.props.isWorking) {
      return (
        <Box>
          <Text color="cyan">Running</Text>
          {goalPart}
          <Text dimColor>  ·  {ctx}</Text>
        </Box>
      )
    }

    const v = (await $.state.get(REF)).value ?? null
    return (
      <Box>
        {v === null ? null : v.isReady ? <Text color="green">✓ Ready</Text> : <Text color="yellow">✗ Not ready</Text>}
        {goalPart}
        <Text dimColor>  ·  {ctx}</Text>
      </Box>
    )
  })
}
