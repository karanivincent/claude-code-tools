// The rendered-world checks (toon-world SKILL.md "A rendered world behind drawn people", 18 November 2026), read from
// a film's own files before any render. No three.js, no files: the tool (templates/scene/tools/world-check.mjs) reads
// the files and passes their text and objects in, so each check is a pure function with a test.
// Why (audit A, 18 November 2026, findings 9, 16 and 21): the new look's rules were proved by "check critic" or by
// scripts marked (new) that nobody built; a film could keep the ink pass on or a rim on its cards with every check green.

/** a fault: which rule, the scene or place it is about, and what to do */
export interface WorldFault { rule: string; scene?: string; place?: string; what: string }

// ---- S3-213: no ink on the world -------------------------------------------------------------------------------------
/** How the stage file sets the ink pass: 'none' (no InkPass is made), 'off' (its default is false), 'on' (its default is
 *  true: the template's), 'per-place' (the default reads the place, as hannibal-oxen's `ink: place.ink`), 'unknown'. */
export function inkSetting(stageSrc: string): 'none' | 'off' | 'on' | 'per-place' | 'unknown' {
  const code = stageSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  if (!/new\s+InkPass\s*\(/.test(code)) return 'none';
  // the toggles' defaults: `{ ink: true, lens: true, ... }`; the type `ink: boolean` and the pass itself
  // (`ink: new InkPass(...)`) are skipped
  const vals = [...code.matchAll(/\bink\s*:\s*([^,}\n;]+)/g)].map((m) => m[1].trim()).filter((v) => !/^(boolean\b|new\s)/.test(v));
  if (!vals.length) return 'unknown';
  if (vals.some((v) => v === 'true')) return 'on';
  if (vals.every((v) => v === 'false')) return 'off';
  if (vals.some((v) => /\.ink\b/.test(v))) return 'per-place';
  return 'unknown';
}

/** S3-213: the ink pass is off for the world in every place a scene uses. `places` maps a place name to its PlaceDef (only
 *  `ink` is read); `used` maps each scene to its place. */
export function checkInk(stageSrc: string, places: Record<string, { ink?: unknown }>, used: Record<string, string>): WorldFault[] {
  const how = inkSetting(stageSrc), out: WorldFault[] = [];
  if (how === 'none' || how === 'off') return out;
  if (how === 'on') return [{ rule: 'S3-213', what: 'the stage file turns the ink pass on (its post toggles default `ink: true`): turn it off for the world, or read it from the place (`ink: place.ink`) and set `ink: false` on each place' }];
  if (how === 'unknown') return [{ rule: 'S3-213', what: 'the stage file makes an InkPass but its default could not be read (`ink: true`, `ink: false` or `ink: place.ink`): make it one of those' }];
  for (const [scene, place] of Object.entries(used)) {
    if (places[place]?.ink) out.push({ rule: 'S3-213', scene, place, what: `the place "${place}" turns the ink pass on (ink: ${String(places[place].ink)}): set ink: false` });
  }
  return out;
}

// ---- S3-224: no rim on a card ----------------------------------------------------------------------------------------
export interface RimsLike { on?: number; width?: number; cool?: number }
export interface LightLike { rims?: RimsLike; charTint?: [number, number, number] }
/** The rims a place light puts on the cards, read the way templates/look/cardshade.ts draws them: a warm rim when
 *  `rims.on` is over 0, and ALSO whenever the light is warm (1 - charTint blue over 0.2: cardshade's
 *  `max(uRimOn, smoothstep(0.2, 0.4, 1.0 - uCharTint.b))`), so `rims.on: 0` alone does not turn it off; a cool rim when
 *  `rims.cool` is over 0. A width of 0 draws neither. A light with no rims keeps cardshade's default (on 0, width 2). */
export function activeRims(L: LightLike): string[] {
  const r = { on: 0, width: 2, cool: 0, ...(L.rims ?? {}) }, out: string[] = [];
  if (!(r.width > 0)) return out;
  if (r.on > 0) out.push(`a warm rim (rims.on ${r.on})`);
  else if (L.charTint && 1 - L.charTint[2] > 0.2) out.push(`a warm rim switched on by the warm card tint (charTint blue ${L.charTint[2]}, under 0.8; cardshade lights a rim whenever 1 - blue is over 0.2)`);
  if (r.cool > 0) out.push(`a cool rim (rims.cool ${r.cool})`);
  return out;
}
/** S3-224: no place light a scene uses draws a rim on the cards. A place that draws its cards flat (`people.flat`, the
 *  flat card mode built on hannibal-oxen, which replaces the card's whole shading and the rims with it) passes. */
export function checkRims(places: Record<string, { light?: LightLike; people?: { flat?: unknown } }>, used: Record<string, string>): WorldFault[] {
  const out: WorldFault[] = [], seen = new Set<string>();
  for (const [scene, place] of Object.entries(used)) {
    const p = places[place];
    if (!p?.light || seen.has(place) || p.people?.flat) continue;
    seen.add(place);
    for (const rim of activeRims(p.light)) out.push({ rule: 'S3-224', scene, place, what: `the place light of "${place}" draws ${rim} on the cards: set rims { on: 0, cool: 0 } and keep charTint blue at 0.8 or more` });
  }
  return out;
}

// ---- S3-223: never emissive -----------------------------------------------------------------------------------------
const zeroColour = (v: string) => /^(0x0+|0|['"]#0{3}(0{3})?['"]|['"]black['"])$/i.test(v.trim());
/** S3-223 (the "never emissive" half): every emissive colour or intensity set in the cards' own code (the film's cast.ts,
 *  the project's look/cardshade.ts) is zero. `files` maps a file name to its text. Places, fires and bulbs may glow:
 *  pass only the cards' files. The flat, gradient-free half of S3-223 needs the flat card mode in templates/look. */
export function checkEmissive(files: Record<string, string>): WorldFault[] {
  const out: WorldFault[] = [];
  for (const [name, src] of Object.entries(files)) {
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      for (const m of code.matchAll(/emissiveIntensity\s*[:=]\s*([\d.]+)/g)) if (Number(m[1]) > 0) out.push({ rule: 'S3-223', what: `${name}:${i + 1} sets emissiveIntensity ${m[1]} on a card: a card is lit by the place, never emissive` });
      for (const m of code.matchAll(/emissive\s*:\s*([^,}]+)/g)) if (!zeroColour(m[1])) out.push({ rule: 'S3-223', what: `${name}:${i + 1} gives a card material emissive ${m[1].trim()}: never emissive` });
      for (const m of code.matchAll(/\.emissive\.set(?:Hex|RGB|Scalar)?\(([^)]*)\)/g)) if (!m[1].split(',').every(zeroColour)) out.push({ rule: 'S3-223', what: `${name}:${i + 1} sets a card's emissive to ${m[1].trim()}: never emissive` });
    });
  }
  return out;
}

// ---- S2-37: a reference frame for each scene --------------------------------------------------------------------------
/** The markdown tables in a text: each a header and its rows, cells trimmed. */
export function mdTables(md: string): { header: string[]; rows: string[][] }[] {
  const out: { header: string[]; rows: string[][] }[] = [];
  const lines = md.split('\n');
  const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) continue;
    const header = cells(lines[i]), rows: string[][] = [];
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) rows.push(cells(lines[j]));
    out.push({ header, rows });
    i = j - 1;
  }
  return out;
}
/** The frames a cell names: paths with a picture's extension (in backticks or not), and catalog ids such as `s011`. */
export function frameTokens(cell: string): { paths: string[]; ids: string[] } {
  const paths = [...cell.matchAll(/[\w./@-]+\.(?:jpe?g|png|webp)\b/gi)].map((m) => m[0]);
  const rest = cell.replace(/[\w./@-]+\.(?:jpe?g|png|webp)\b/gi, ' ');
  const ids = [...rest.matchAll(/\b[a-z]{0,3}\d{2,5}\b/gi)].map((m) => m[0]);
  return { paths, ids };
}
/** S2-37: each scene names a reference frame (a table with a "Scene" column and a "Reference frame" or "Scene frame"
 *  column, in any of `docs`: scenes.md, parts.md "Scene frames" or the plan), and every frame it names is on disk.
 *  `found(token)` says whether a path or catalog id resolves to a file. */
export function checkSceneFrames(docs: Record<string, string>, scenes: string[], found: (token: string) => boolean): WorldFault[] {
  const named = new Map<string, { doc: string; cell: string }>();
  for (const [doc, md] of Object.entries(docs)) {
    for (const t of mdTables(md)) {
      const sc = t.header.findIndex((h) => /^scenes?$/i.test(h)), fr = t.header.findIndex((h) => /reference frame|scene frame/i.test(h));
      if (sc < 0 || fr < 0) continue;
      for (const r of t.rows) {
        const id = (r[sc] ?? '').replace(/[`*]/g, '').trim().split(/[\s,(]/)[0];
        if (id && !named.has(id)) named.set(id, { doc, cell: r[fr] ?? '' });
      }
    }
  }
  const out: WorldFault[] = [];
  for (const scene of scenes) {
    const n = named.get(scene);
    if (!n || !n.cell || /todo|tbd|none|^-$/i.test(n.cell)) { out.push({ rule: 'S2-37', scene, what: n ? `${n.doc} names no reference frame for ${scene} ("${n.cell}")` : `no reference frame named for ${scene} (a row in a "Scene | Reference frame" table of ${Object.keys(docs).join(' or ') || 'scenes.md'})` }); continue; }
    const { paths, ids } = frameTokens(n.cell);
    if (!paths.length && !ids.length) { out.push({ rule: 'S2-37', scene, what: `${n.doc}: the reference frame of ${scene} ("${n.cell}") names no file or catalog id` }); continue; }
    for (const t of [...paths, ...ids]) if (!found(t)) out.push({ rule: 'S2-37', scene, what: `${n.doc}: the reference frame "${t}" of ${scene} is not on disk` });
  }
  return out;
}

// ---- S3-231: a probe still per place; S3-191: a named light source -----------------------------------------------------
/** S3-231: each place a scene uses has a probe still (out/<slug>/places/<place>/probe.jpg or probe-<anything>.jpg/png).
 *  `files(place)` lists the file names in that place's folder (empty when there is none). */
export function checkProbes(used: Record<string, string>, files: (place: string) => string[]): WorldFault[] {
  const out: WorldFault[] = [];
  for (const place of new Set(Object.values(used))) {
    if (!files(place).some((f) => /^probe([-_.].*)?\.(jpe?g|png)$/i.test(f))) {
      const scenes = Object.entries(used).filter(([, p]) => p === place).map(([s]) => s).join(', ');
      out.push({ rule: 'S3-231', place, what: `no probe still for "${place}" (scenes ${scenes}): out/<slug>/places/${place}/probe.jpg, from its widest camera, beside the scene's reference frame, before the place is built out` });
    }
  }
  return out;
}

const SOURCE = /\b(sun|sunlight|moon|moonlight|window|windows|lamp|lamps|lantern|fire|fires|firelight|torch|torches|candle|candles|brazier|flame|flames|bulb|bulbs|skylight|sky|door|doorway|hearth|campfire)\b/i;
const SIDE = /\b(left|right|behind|front|above|overhead|below|side|north|south|east|west|back|upper|lower|top|centre|center|low|high)\b/i;
/** S3-191: the parts plan names each place's light source (a sun, window, lamp or fire in the place) and the side it
 *  shines from. Read from a "## <place>" section (a line with "light" in it) or from a table row whose first cell is
 *  the place and whose header has a "Source" column (the hannibal-oxen plan's light table). */
export function checkLightSources(docs: Record<string, string>, places: string[]): WorldFault[] {
  const out: WorldFault[] = [];
  // "Fabius's tent" names the place fabiusTent, "fire close" fireClose
  const same = (a: string, b: string) => { const k = (x: string) => x.toLowerCase().replace(/'s\b/g, '').replace(/[^a-z0-9]/g, ''); return k(a) === k(b); };
  for (const place of places) {
    const said: string[] = [];
    for (const md of Object.values(docs)) {
      const sec = md.split(/^##+\s+/m).find((s) => same(s.split('\n')[0], place));
      if (sec) said.push(...sec.split('\n').slice(1).filter((l) => /light/i.test(l)));
      for (const t of mdTables(md)) {
        const src = t.header.findIndex((h) => /source/i.test(h));
        if (src < 0) continue;
        for (const r of t.rows) if (same(r[0] ?? '', place)) said.push(r[src] ?? '');
      }
    }
    const good = said.some((l) => !/\bTODO\b/.test(l) && SOURCE.test(l) && SIDE.test(l));
    if (!good) out.push({ rule: 'S3-191', place, what: said.length
      ? `the light named for "${place}" gives no source in the place and side ("${said[0].trim().slice(0, 80)}"): name the sun, window, lamp or fire and the side it shines from`
      : `no light source named for "${place}" in the parts plan: a "## ${place}" section with a "- Light: <the sun, window, lamp or fire>, from <side>" line` });
  }
  return out;
}

/** The scenes a film declares as night: a place (or its light) with `night: true`, or named on the command line. */
export function nightScenes(places: Record<string, { night?: unknown; light?: { night?: unknown } }>, used: Record<string, string>, named: string[] = []): string[] {
  return Object.entries(used).filter(([s, p]) => named.includes(s) || named.includes(p) || !!places[p]?.night || !!places[p]?.light?.night).map(([s]) => s);
}

export const formatFault = (f: WorldFault) => `FAULT ${f.scene ?? '-'}${f.place ? ` (${f.place})` : ''} ${f.rule}: ${f.what}`;
