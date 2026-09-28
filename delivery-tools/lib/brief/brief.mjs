// Design briefs (components-first spec §8.2, §8.3): what a Claude Design chat is sent. A brief
// names its screens (each with a Phone: line), the components to use by name from
// components.json, numbered behaviours (`delivery rules` reads these) and data using only generic
// names, never a real customer's or prospect's. Pure apart from briefComponents (reads the
// profile and the component map through ctx), packBrief (copies files for the send step) and
// recordSent (appends to the sent record on disk).

import { existsSync, readdirSync } from 'node:fs';
import { readFile, copyFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { writeFileAtomic, readJson, writeJsonAtomic, withLock } from '../core/fs.mjs';
import { DeliveryError, EXIT } from '../core/exit.mjs';
import { sha256File } from '../core/hash.mjs';
import { componentsMapPath, readComponentsMap } from '../components/map.mjs';

const NUMBERED_RE = /^\d+\.(\s|$)/;

/**
 * The next brief's path, relative to intentDir: "briefs/NN-<slug>.md", NN one above the highest
 * existing "NN-*" file in intentDir/briefs/ (1 when that folder is empty or missing).
 * @param {string} intentDir
 * @param {string} slug
 * @returns {string}
 */
export function nextBriefPath(intentDir, slug) {
  const dir = join(intentDir, 'briefs');
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const nums = names
    .map((n) => /^(\d+)-/.exec(n))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `briefs/${String(next).padStart(2, '0')}-${slug}.md`;
}

/**
 * Fill {{title}} and {{components}} in the design-brief template.
 * @param {string} template
 * @param {{ title: string, components?: { kind: 'design'|'base', name: string }[] }} o
 *   components: the component map's entries (both kinds); "none yet" when there are neither.
 * @returns {string}
 */
export function fillTemplate(template, { title, components = [] }) {
  const design = components.filter((c) => c.kind === 'design').map((c) => c.name);
  const base = components.filter((c) => c.kind === 'base').map((c) => c.name).sort();
  const lines = design.map((name) => `- ${name}`);
  if (base.length) lines.push(`- Base components: ${base.join(', ')}`);
  const componentsText = lines.length ? lines.join('\n') : 'none yet';
  return template.split('{{title}}').join(title).split('{{components}}').join(componentsText);
}

/**
 * The forbidden names and component names every brief subcommand checks against, read once from
 * the profile and the component map. Shared so `new`, `check` and `pack` agree on what a brief may
 * name (components-first spec §8.2).
 * @param {import('../core/ctx.mjs').Ctx} ctx
 * @returns {Promise<{ forbiddenNames: string[], allComponents: object[], componentNames: string[] }>}
 */
export async function briefComponents(ctx) {
  const profile = await ctx.profile();
  const mapPath = componentsMapPath(ctx.repoRoot, profile);
  const map = await readComponentsMap(mapPath);
  const allComponents = map?.components ?? [];
  return {
    forbiddenNames: profile.design?.forbiddenNames ?? [],
    allComponents,
    componentNames: allComponents.filter((c) => c.kind === 'design').map((c) => c.name),
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A regex matching `words` in order, joined by any run of whitespace, "-" or "_" (so a forbidden
 * or described-in-words phrase is caught the same way in prose, a kebab-case name and a
 * snake_case file name). Whole-word: "-" and "_" count as boundaries too, so "Acme" never matches
 * inside "Acmes" but "Summit Interiors" matches "summit-interiors-dashboard.png". Case-insensitive.
 */
function phraseRe(words) {
  const body = words.map(escapeRegex).join('[\\s_-]+');
  return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, 'i');
}

/** PascalCase split into words: "DatePicker" -> ["Date", "Picker"]; a single word stays one. */
function pascalWords(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Problems with a brief's text (components-first spec §8.2, delivery-tools 0.9 plan task 6):
 *   - a forbidden name (case-insensitive, whole word(s)) in the text or in any of fileNames;
 *   - a "### Screen:" heading whose section has no "Phone:" line;
 *   - a component name from the map (componentNames: design-kind names only — base entries and
 *     single-word names never trip this) appearing only as the words that describe it (lowercase,
 *     joined by whitespace, "-" or "_" — "date picker" or "date-picker" for "DatePicker") while
 *     the exact name is absent;
 *   - a non-blank line under "## Behaviours" that is not a numbered item ("1.").
 * @param {string} text
 * @param {{ forbiddenNames?: string[], componentNames?: string[], fileNames?: string[] }} [opts]
 * @returns {string[]}
 */
export function briefProblems(text, opts = {}) {
  const forbiddenNames = opts.forbiddenNames ?? [];
  const componentNames = opts.componentNames ?? [];
  const fileNames = opts.fileNames ?? [];
  const problems = [];

  for (const name of forbiddenNames) {
    const words = String(name).trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const re = phraseRe(words);
    if (re.test(text)) problems.push(`"${name}" is a forbidden name and appears in the brief text`);
    for (const f of fileNames) {
      if (re.test(f)) problems.push(`"${name}" is a forbidden name and appears in the file name "${f}"`);
    }
  }

  const lines = text.split('\n');
  const headingAt = [];
  lines.forEach((l, i) => { if (/^#{1,6}\s/.test(l)) headingAt.push(i); });
  const sectionBody = (startLine) => {
    const idx = headingAt.indexOf(startLine);
    const end = idx + 1 < headingAt.length ? headingAt[idx + 1] : lines.length;
    return lines.slice(startLine + 1, end);
  };

  for (const i of headingAt) {
    const m = /^###\s+Screen:\s*(.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const body = sectionBody(i).join('\n');
    if (!/^\s*Phone:/m.test(body)) problems.push(`Screen: ${m[1]} has no Phone: line`);
  }

  for (const name of componentNames) {
    const words = pascalWords(name);
    if (words.length < 2) continue; // single-word names are ordinary English; never trips
    const described = phraseRe(words.map((w) => w.toLowerCase()));
    const exact = new RegExp(`\\b${escapeRegex(name)}\\b`);
    if (described.test(text) && !exact.test(text)) {
      problems.push(`"${words.join(' ').toLowerCase()}" describes ${name} in words instead of naming it`);
    }
  }

  const behavioursAt = headingAt.find((i) => /^##\s+Behaviours\s*$/.test(lines[i]));
  if (behavioursAt !== undefined) {
    for (const line of sectionBody(behavioursAt)) {
      const t = line.trim();
      if (!t) continue;
      if (!NUMBERED_RE.test(t)) problems.push(`a line under ## Behaviours is not numbered: "${t}"`);
    }
  }

  return problems;
}

/**
 * Build the pack folder the send step uploads: the checked brief as "00-brief.md", then each
 * image as "NN-<basename>" in the order given (01, 02, ...). Runs briefProblems on the brief's
 * text and the images' file names first and refuses (throws) when it finds anything.
 * @param {string} briefPath
 * @param {string[]} images
 * @param {string} outDir
 * @param {{ forbiddenNames?: string[], componentNames?: string[] }} [opts]
 * @returns {Promise<{ dir: string, files: string[] }>}
 */
export async function packBrief(briefPath, images, outDir, opts = {}) {
  let text;
  try {
    text = await readFile(briefPath, 'utf8');
  } catch (err) {
    const message = err.code === 'ENOENT' ? `${briefPath} does not exist` : `${briefPath}: ${err.message}`;
    throw new DeliveryError(EXIT.RED, message, { failures: [{ code: 'brief', message }] });
  }
  const fileNames = images.map((p) => basename(p));
  const problems = briefProblems(text, { forbiddenNames: opts.forbiddenNames, componentNames: opts.componentNames, fileNames });
  if (problems.length) {
    throw new DeliveryError(EXIT.RED, `brief check found ${problems.length} problem(s): ${problems.join('; ')}`, {
      failures: problems.map((p) => ({ code: 'brief', message: p })),
    });
  }

  const files = ['00-brief.md'];
  await writeFileAtomic(join(outDir, '00-brief.md'), text);
  for (const [i, img] of images.entries()) {
    const name = `${String(i + 1).padStart(2, '0')}-${basename(img)}`;
    await copyFile(img, join(outDir, name));
    files.push(name);
  }
  return { dir: outDir, files };
}

/**
 * Append one entry to intent/briefs/sent.json (components-first spec §8.3), creating the file if
 * it doesn't exist yet: `{ "sent": [ {file, chat, at, sha256}, ... ] }`. `sha256` is the hex digest
 * of the brief file's bytes, read from `file`. Read-modify-write under a lock, the same way
 * recordFindings and updateState do, so two sessions sending at once cannot lose one's entry.
 * @param {string} intentDir
 * @param {{ file: string, chat: string, at?: string }} o  at: ISO timestamp; defaults to now
 * @returns {Promise<void>}
 */
export async function recordSent(intentDir, { file, chat, at = new Date().toISOString() }) {
  const sentPath = join(intentDir, 'briefs', 'sent.json');
  const digest = await sha256File(file);
  return withLock(`${sentPath}.lock`, async () => {
    const existing = await readJson(sentPath, { optional: true });
    const sent = existing?.sent ?? [];
    sent.push({ file, chat, at, sha256: digest });
    await writeJsonAtomic(sentPath, { sent });
  });
}
