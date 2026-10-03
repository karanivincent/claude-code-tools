// node --test tests/tasks.node-test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTasks, progress, sectionFor } from '../hooks/tasks.ts'

const MD = `## Goal map mod
- [x] Build the goal-map mod (#74)
  - [ ] detour: move archive-ready to the repo
    - [ ] Add it to the marketplace (#76)
- [ ] @me Run /goal-map-backfill 7, check map

## Public API v1
- [ ] Step 11 signed message
`

test('one section per heading, with mine, detour, depth and PRs', () => {
  const s = parseTasks(MD)
  assert.deepEqual(s.map(x => x.title), ['Goal map mod', 'Public API v1'])
  const steps = s[0]!.steps
  assert.deepEqual(steps[0]!.prs, [74])
  assert.equal(steps[1]!.isDetour, true)
  assert.equal(steps[1]!.text, 'move archive-ready to the repo')
  assert.equal(steps[2]!.depth, 2)
  assert.equal(steps[3]!.isMine, true)
  assert.equal(steps[3]!.text, 'Run /goal-map-backfill 7, check map')
})

test('a goal finds its section by title or by shared words', () => {
  const s = parseTasks(MD)
  assert.equal(sectionFor(s, 'Goal map mod')?.title, 'Goal map mod')
  assert.equal(sectionFor(s, 'Public API v1 build')?.title, 'Public API v1')
  assert.equal(sectionFor(s, 'Pelican pricing'), null)
})

test('a file without headings matches any goal', () => {
  const s = parseTasks('- [ ] one\n- [x] two\n')
  assert.equal(sectionFor(s, 'anything')?.steps.length, 2)
})

test('progress counts, names the next step and an open detour', () => {
  const p = progress(sectionFor(parseTasks(MD), 'Goal map mod')!)
  assert.equal(p.done, 1)
  assert.equal(p.total, 4)
  assert.equal(p.next?.text, 'Add it to the marketplace (#76)')
  assert.deepEqual(p.openDetour, { title: 'move archive-ready to the repo', open: 1 })
})
