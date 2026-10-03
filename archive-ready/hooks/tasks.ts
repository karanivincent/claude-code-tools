// TASKS.md, read as one checklist per goal. Pure: no `$`, so `node --test` reaches it.
//
//   ## Goal map mod
//   - [x] Build the goal-map mod (#74)
//     - [x] detour: move archive-ready to the repo (#76)
//   - [ ] @me Run /goal-map-backfill 7, check map

import type { Section, Step } from '../types'

export type { Section, Step }

export function parseTasks(md: string): Section[] {
  const sections: Section[] = []
  let current: Section | null = null
  for (const line of md.split('\n')) {
    const head = line.match(/^#{1,3}\s+(.+?)\s*$/)
    if (head) {
      current = { title: head[1]!.trim(), steps: [] }
      sections.push(current)
      continue
    }
    const item = line.match(/^(\s*)[-*] \[( |x|X)\]\s+(.*)$/)
    if (!item) continue
    if (!current) {
      current = { title: '', steps: [] }
      sections.push(current)
    }
    let text = item[3]!.trim()
    const isMine = /^@me\b/i.test(text)
    if (isMine) text = text.replace(/^@me\s*/i, '')
    const isDetour = /^detour:/i.test(text)
    if (isDetour) text = text.replace(/^detour:\s*/i, '')
    current.steps.push({
      text,
      isDone: item[2] !== ' ',
      isMine,
      isDetour,
      depth: Math.floor(item[1]!.replace(/\t/g, '  ').length / 2),
      prs: [...text.matchAll(/#(\d{1,6})\b/g)].map(m => Number(m[1])),
    })
  }
  return sections.filter(s => s.steps.length > 0)
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))
}

/**
 * The section for a goal: the same title, else the one sharing most of its words.
 * A file with no headings is one untitled section, which matches any goal, so an
 * old-style checklist keeps working.
 */
export function sectionFor(sections: Section[], goal: string | null): Section | null {
  if (sections.length === 1 && sections[0]!.title === '') return sections[0]!
  if (!goal) return null
  const want = goal.trim().toLowerCase()
  const exact = sections.find(s => s.title.toLowerCase() === want)
  if (exact) return exact
  const goalWords = words(goal)
  let best: Section | null = null
  let bestScore = 0
  for (const s of sections) {
    const w = words(s.title)
    let shared = 0
    for (const x of w) if (goalWords.has(x)) shared++
    const score = shared / Math.max(1, Math.min(w.size, goalWords.size))
    if (score > bestScore) {
      best = s
      bestScore = score
    }
  }
  return bestScore >= 0.5 ? best : null
}

export type Progress = {
  done: number
  total: number
  next: Step | null
  openDetour: { title: string; open: number } | null
}

export function progress(section: Section): Progress {
  const steps = section.steps
  let openDetour: Progress['openDetour'] = null
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!
    if (!s.isDetour || s.isDone) continue
    let open = 0
    for (let j = i + 1; j < steps.length && steps[j]!.depth > s.depth; j++) if (!steps[j]!.isDone) open++
    openDetour = { title: s.text, open: Math.max(1, open) }
  }
  return {
    done: steps.filter(s => s.isDone).length,
    total: steps.length,
    next: steps.find(s => !s.isDone && !s.isDetour) ?? steps.find(s => !s.isDone) ?? null,
    openDetour,
  }
}
