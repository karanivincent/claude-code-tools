#!/usr/bin/env node
// Reads the last N days of Claude Code transcripts and prints, per session, the
// human prompts and the PRs it opened. The mod turns that into goals.
//
//   node backfill.mjs [days]
//
// Read-only. Prints JSON on stdout, small enough for $.process.run.

import { createReadStream, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const days = Number(process.argv[2]) || 7
const since = Date.now() - days * 24 * 60 * 60 * 1000
const root = join(homedir(), '.claude', 'projects')

const NOISE = /^(<system-reminder>|<command-|<local-command|<task-notification>|<bash-|Caveat:|\[Request interrupted)/

function promptText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  if (content.some(p => p?.type === 'tool_result')) return null
  const text = content.filter(p => p?.type === 'text').map(p => p.text).join('\n')
  return text || null
}

async function readSession(file) {
  const out = { id: null, cwd: '', branch: '', startedAt: 0, lastActiveAt: 0, prompts: [], prs: [] }
  const pendingPr = new Map()
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }
    const at = ev.timestamp ? Date.parse(ev.timestamp) : 0
    if (ev.sessionId && !out.id) out.id = ev.sessionId
    if (ev.cwd) out.cwd = ev.cwd
    if (ev.gitBranch && ev.gitBranch !== 'HEAD') out.branch = ev.gitBranch
    if (at) {
      if (!out.startedAt) out.startedAt = at
      out.lastActiveAt = at
    }
    if (ev.isSidechain) continue
    const content = ev.message?.content
    if (ev.type === 'user' && !ev.isMeta) {
      const text = promptText(content)
      if (text && !NOISE.test(text.trim()) && out.prompts.length < 60) {
        out.prompts.push({ at, text: text.slice(0, 400) })
      }
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part?.type !== 'tool_result' || !pendingPr.has(part.tool_use_id)) continue
          const body = typeof part.content === 'string' ? part.content : JSON.stringify(part.content)
          for (const m of body.matchAll(/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)/g)) {
            const n = Number(m[1])
            if (!out.prs.some(p => p.number === n)) out.prs.push({ number: n, at })
          }
          pendingPr.delete(part.tool_use_id)
        }
      }
    }
    if (ev.type === 'assistant' && Array.isArray(content)) {
      for (const part of content) {
        const cmd = part?.type === 'tool_use' && part.name === 'Bash' ? String(part.input?.command ?? '') : ''
        if (/\bgh\s+pr\s+create\b/.test(cmd)) pendingPr.set(part.id, true)
      }
    }
  }
  return out
}

const files = []
for (const dir of readdirSync(root)) {
  const full = join(root, dir)
  let entries
  try {
    entries = readdirSync(full)
  } catch {
    continue
  }
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue
    const path = join(full, name)
    const st = statSync(path)
    if (st.mtimeMs >= since && st.size > 20_000) files.push({ path, mtimeMs: st.mtimeMs })
  }
}
files.sort((a, b) => b.mtimeMs - a.mtimeMs)

const sessions = []
for (const f of files.slice(0, 60)) {
  const s = await readSession(f.path)
  if (s.id && s.prompts.length > 0) sessions.push(s)
}
process.stdout.write(JSON.stringify(sessions))
