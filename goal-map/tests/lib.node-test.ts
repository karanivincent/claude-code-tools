// node --test tests/lib.node-test.ts — the pure decisions, outside the engine.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isInDetour, isTrivialPrompt, lanes, mapSvg, mapText, parseClassification, prRefsIn, repoOfRemote, trailingQuestion, waitingItems } from '../hooks/lib.ts'

const H = 3600_000
const now = 1_000 * H

test('a PR number comes from gh pr create output and gh pr merge args', () => {
  assert.deepEqual(prRefsIn('gh pr create --draft --title x', 'https://github.com/karanivincent/claude-code-tools/pull/74\n'), [{ number: 74, repo: 'karanivincent/claude-code-tools' }])
  assert.deepEqual(prRefsIn('gh pr merge 2231 --squash', ''), [{ number: 2231, repo: undefined }])
  assert.deepEqual(prRefsIn('gh pr merge 9 --repo a/b', ''), [{ number: 9, repo: 'a/b' }])
  assert.deepEqual(prRefsIn('gh pr view 12', 'https://github.com/a/b/pull/12'), [])
  assert.equal(repoOfRemote('git@github.com:Telitask/Telitask.git'), 'Telitask/Telitask')
})

test('only a closing question counts as waiting on you', () => {
  assert.equal(trailingQuestion('Done.\n\nShall I merge #12?'), 'Shall I merge #12?')
  assert.equal(trailingQuestion('Is it? Yes. All done.'), null)
})

test('short approvals never cost a model call', () => {
  assert.ok(isTrivialPrompt('yes go ahead'))
  assert.ok(isTrivialPrompt('merge'))
  assert.ok(!isTrivialPrompt('yes but also fix the e2e flake in script-practice'))
})

test('a session is in a detour until it goes back', () => {
  const s = (kind: 'goal' | 'continue' | 'detour' | 'back') => ({ at: 0, kind, topic: '', text: '' })
  assert.equal(isInDetour([s('goal'), s('detour'), s('continue')]), true)
  assert.equal(isInDetour([s('goal'), s('detour'), s('back')]), false)
})

test('the first prompt is always a goal, and bad JSON is no answer', () => {
  assert.equal(parseClassification('{"kind":"continue","topic":"x"}', false)?.kind, 'goal')
  assert.equal(parseClassification('nope', true), null)
})

test('an open PR naming an issue a merged PR fixed is flagged as a duplicate', () => {
  const pr = (number: number, state: 'OPEN' | 'MERGED', title: string) => ({ repo: 'T/T', number, title, state, isDraft: false, checks: 'passing' as const, url: `u/${number}`, labels: [], updatedAt: '' })
  const items = waitingItems({
    sessions: [],
    goals: [],
    prs: { 'T/T#2235': pr(2235, 'OPEN', 'Match a verified number (#2229)'), 'T/T#2236': pr(2236, 'MERGED', 'Refuse uncallable (#2229)') },
    decisions: [],
    now,
  })
  assert.ok(items.some(i => i.kind === 'duplicate' && i.title.includes('#2236 (merged)')))
})

export const sample = () => {
  const goals = [
    { id: 'api', title: 'Public API v1', createdAt: now - 40 * H, doneAt: null },
    { id: 'flake', title: 'Fix e2e flake in script practice', createdAt: now - 20 * H, doneAt: null },
    { id: 'pricing', title: 'Decide Pelican pricing', createdAt: now - 30 * H, doneAt: now - 2 * H },
  ]
  const st = (at: number, kind: 'goal' | 'continue' | 'detour' | 'back', topic: string) => ({ at: now - at * H, kind, topic, text: topic })
  const sessions = [
    { id: '17691754aaaa', cwd: '/x', repo: 'T/T', branch: 'docs/public-api-plan', goalId: 'api', startedAt: now - 40 * H, lastActiveAt: now - 1 * H, status: 'idle' as const,
      steps: [st(40, 'goal', 'public API plan'), st(30, 'detour', 'unlock bank PDF'), st(29, 'continue', 'pdf'), st(28, 'back', 'API step 11'), st(10, 'detour', 'why call them orders?'), st(9, 'back', 'API errors')],
      prs: [{ number: 2231, at: now - 26 * H }, { number: 2236, at: now - 5 * H }], question: { text: 'Shall I start the production release?', at: now - 1 * H } },
    { id: '85431e71bbbb', cwd: '/x', repo: 'T/T', branch: 'fix/dialler-gate', goalId: 'api', startedAt: now - 20 * H, lastActiveAt: now - 3 * H, status: 'ended' as const,
      steps: [st(20, 'goal', 'dialler gate refusal')], prs: [{ number: 2237, at: now - 6 * H }], question: null },
    { id: 'reverent0000', cwd: '/x', repo: 'T/T', branch: 'claude/flake', goalId: 'flake', startedAt: now - 20 * H, lastActiveAt: now - 0.2 * H, status: 'working' as const,
      steps: [st(20, 'goal', 'flake')], prs: [{ number: 2240, at: now - 0.5 * H }], question: null },
  ]
  const pr = (number: number, state: 'OPEN' | 'MERGED', title: string, checks: 'passing' | 'failing' = 'passing') => ({ repo: 'T/T', number, title, state, isDraft: false, checks, url: `https://github.com/Telitask/Telitask/pull/${number}`, labels: [], updatedAt: '' })
  const prs = { 'T/T#2231': pr(2231, 'MERGED', 'Attempts counts dials (#2220)'), 'T/T#2236': pr(2236, 'MERGED', 'Refuse uncallable calls (#2229)'), 'T/T#2237': pr(2237, 'MERGED', 'Gate refusal (#2228)'), 'T/T#2240': pr(2240, 'OPEN', 'Fix bench row wait (#1996)', 'failing'), 'T/T#2235': pr(2235, 'OPEN', 'Match verified number (#2229)') }
  const waiting = waitingItems({ sessions, goals, prs, decisions: [{ number: 1942, title: 'Drop the widgets rehearsal table?', url: 'u' }], now })
  return { goals, sessions, prs, waiting, refreshedAt: now, error: null }
}

test('the map draws every live goal', () => {
  const ls = lanes(sample(), now, true)
  assert.equal(ls.length, 3)
  assert.match(mapSvg(ls, now).source, /^<svg/)
  assert.ok(mapText(ls, now).some(l => l.includes('Public API v1')))
})

test('@me steps come from the goal heading only', async () => {
  const { myOpenSteps } = await import('../hooks/lib.ts')
  const md = '## Goal map mod\n- [ ] @me Run the backfill\n- [ ] Build it\n## Public API v1\n- [ ] @me Approve step 11\n'
  assert.deepEqual(myOpenSteps(md, 'Goal map mod'), ['Run the backfill'])
  assert.deepEqual(myOpenSteps(md, 'Pelican pricing'), [])
})

test('a session that moves to a new goal leaves a paused lane and forks a new one, with times', async () => {
  const { lanes, mapSvg, mapText, clock, duration, activeTime } = await import('../hooks/lib.ts')
  const M = 60_000
  const t0 = Date.UTC(2026, 9, 3, 19, 0) // 22:00 in Nairobi
  const goals = [
    { id: 'a', title: 'Goal map mod', createdAt: t0, doneAt: null },
    { id: 'b', title: 'Pricing idea', createdAt: t0 + 40 * M, doneAt: null },
  ]
  const step = (m: number, kind: 'goal' | 'continue', goalId: string, topic: string) => ({ at: t0 + m * M, kind, topic, text: topic, goalId })
  const s = {
    id: 'sess0001xxxx', cwd: '/x', repo: 'T/T', branch: 'claude/x', goalId: 'b', startedAt: t0, lastActiveAt: t0 + 70 * M,
    status: 'ended' as const, question: null,
    steps: [step(0, 'goal', 'a', 'start'), step(20, 'continue', 'a', 'more'), step(40, 'goal', 'b', 'what to charge'), step(70, 'continue', 'b', 'numbers')],
    prs: [{ number: 74, at: t0 + 30 * M, repo: 'T/T', goalId: 'a' }],
  }
  const ls = lanes({ goals, sessions: [s], prs: {}, waiting: [], refreshedAt: t0, error: null }, t0 + 80 * M, true)
  const a = ls.find(l => l.goal.id === 'a')!
  const b = ls.find(l => l.goal.id === 'b')!
  assert.equal(a.isPaused, true)
  assert.ok(a.events.some(e => e.icon === 'left'))
  assert.ok(a.events.some(e => e.label.startsWith('#74')))
  assert.ok(b.events.some(e => e.icon === 'switch' && e.fromGoalId === 'a'))
  assert.equal(clock(t0, 180), '22:00')
  assert.equal(duration(activeTime([t0, t0 + 20 * M, t0 + 40 * M])), '40m')
  assert.match(mapSvg(ls, t0 + 80 * M, 820, 60, 180).source, /TODAY|SAT/)
  assert.ok(mapText(ls, t0 + 80 * M, 8, 180).some(line => line.includes('22:00')))
})
