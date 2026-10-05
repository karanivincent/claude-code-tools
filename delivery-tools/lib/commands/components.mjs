// delivery components: the component map, checked against the repo and the design system export.
// Product-wide (components-first spec §2): works with no --feature, no run required.
// Owner: slice C (docs/ARCHITECTURE.md).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineCommand } from '../core/command.mjs';
import { parseCommandArgs } from '../core/args.mjs';
import { EXIT, UsageError } from '../core/exit.mjs';
import {
  componentsMapPath, readComponentsMap, writeComponentsMap, validateComponentsMap,
  scanBase, missingFromDesignSystem, findDesignSystemManifest, refreshDesignEntries,
} from '../components/map.mjs';
import { readExportComponents, componentOrder } from '../design/components.mjs';
import { readMap } from '../picture/map.mjs';
import { mapUsedComponents } from '../picture/next.mjs';

export default defineCommand({
  name: 'components',
  summary: 'The component map, checked against the repo and the design system export',
  usage: `usage: delivery components [--scan-base] [--mark-built <Name>]... [--export <dir>] [--used]

Product-wide, not a run: prints docs/delivery/components.json (profile.components.map), each
entry's status, checked against the repo. Needs no --feature. With no profile.components block,
prints that components are not configured and exits 0.

--scan-base rewrites every "kind": "base" entry from profile.components.baseDir, recording which
of profile.components.baseLibraries each file imports (a trailing /* matches any subpath). Design
entries are left untouched. Creates the map when it does not exist yet. A base entry whose file no
longer exists is dropped and reported.

--mark-built <Name> sets a design entry's builtHash to its design hash in the run's own snapshot
(when a run is resolved here and its snapshot has the component), else to the hash components.json
records, and its status to built. Refused (exit 2) when the entry has no target yet, or its target is missing on disk. May
be repeated.

--export <dir> is a design export directory to compare the map against: its .dc.html files (is a
design component stale, is one missing from the map) and its _ds/*/_ds_manifest.json (has the
design system been synced). When a run is resolved in this worktree its own design snapshot is
used instead. With neither, both comparisons are skipped and the map's own recorded status is
printed as-is. This never writes components.json: a components run's intake (a later slice) is
what records a fresh hash; this command only reports drift.

--used needs a run resolved in this worktree (--feature, or the worktree's own run): prints each
component the run's design states show (from .delivery/<feature>/design/<ID>.components.json),
one line each, as "<Name> -> <target> (props: design->code, ...)". For the builder: run this
instead of reading the map yourself.

exit: 0 configured and every check passes; 1 a design entry is stale, one is in the export but
      not the map, a file in baseDir has no base entry, the export has a malformed dc-import, its
      uses form a cycle, or validateComponentsMap finds a problem; 2 usage, or no components.json
      to work with

common options:
  --feature <slug>   only used, if a run is resolved, to find its design snapshot, or with --used
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: {
        'scan-base': { type: 'boolean' },
        'mark-built': { type: 'string', multiple: true },
        export: { type: 'string' },
        used: { type: 'boolean' },
      },
    });
    const profile = await ctx.profile();
    const path = componentsMapPath(ctx.repoRoot, profile);
    if (!path) {
      ctx.out.line('components are not configured (no profile.components block)');
      return EXIT.PASS;
    }

    let map = await readComponentsMap(path);

    if (values.used) {
      const runPaths = ctx.paths;
      if (!runPaths) throw new UsageError('--used needs a run resolved in this worktree; pass --feature <slug>');
      const runMap = readMap(runPaths);
      if (!runMap) throw new UsageError(`no map.json for this run at ${runPaths.deliveryDir}; run delivery map first`);
      const byName = new Map((map?.components ?? []).filter((c) => c.kind === 'design').map((c) => [c.name, c]));
      const used = mapUsedComponents(runPaths, runMap);
      for (const name of used) {
        const c = byName.get(name);
        const target = c?.target ?? '(not mapped yet)';
        const props = Object.entries(c?.props ?? {}).map(([d, code]) => `${d}->${code}`).join(', ') || 'none';
        ctx.out.line(`${name} -> ${target} (props: ${props})`);
      }
      ctx.out.set('components', { used });
      return EXIT.PASS;
    }

    if (values['scan-base']) {
      if (!profile.components.baseDir) throw new UsageError('profile.components.baseDir is not set; add it before running --scan-base');
      const design = (map?.components ?? []).filter((c) => c.kind === 'design');
      const designTargets = new Set(design.filter((c) => c.target).map((c) => c.target));
      const base = scanBase(ctx.repoRoot, profile.components.baseDir, profile.components.baseLibraries ?? [], designTargets);
      const previousBase = (map?.components ?? []).filter((c) => c.kind === 'base');
      const removed = previousBase.filter((c) => !existsSync(join(ctx.repoRoot, c.target)));
      for (const c of removed) ctx.out.line(`removed ${c.name} (${c.target}): the file no longer exists`);
      map = { version: 1, allowOwns: map?.allowOwns ?? [], components: [...design, ...base] };
      await writeComponentsMap(path, map);
      ctx.out.line(`scanned ${profile.components.baseDir}: ${base.length} base component(s)`);
    }

    if (!map) {
      throw new UsageError(`no components map at ${path}; the mapper writes it (briefs/components-mapper.md), or run delivery components --scan-base to start one`);
    }

    const markBuilt = values['mark-built'] ?? [];
    // The hash a builder built against is the run's own snapshot's, when this runs inside a run:
    // components.json may still record an older export's hash, and marking that one built would
    // leave the component stale against the very design it was built from.
    let snapshotHashes = null;
    if (markBuilt.length && ctx.paths?.designSnapshot && existsSync(ctx.paths.designSnapshot)) {
      const { components } = await readExportComponents(ctx.paths.designSnapshot);
      snapshotHashes = new Map(components.map((c) => [c.name, c.hash]));
    }
    for (const name of markBuilt) {
      const entry = map.components.find((c) => c.kind === 'design' && c.name === name);
      if (!entry) throw new UsageError(`no design component named "${name}"`);
      if (!entry.target) throw new UsageError(`${name} has no target yet; the mapper must set one before it can be marked built`);
      if (!existsSync(join(ctx.repoRoot, entry.target))) throw new UsageError(`${name}: target ${entry.target} does not exist on disk`);
      const fromSnapshot = snapshotHashes?.get(name) ?? null;
      entry.builtHash = fromSnapshot ?? entry.design.hash;
      entry.status = 'built';
      ctx.out.line(`marked ${name} built at ${entry.builtHash}${fromSnapshot ? ' (from the run\'s design snapshot)' : ''}`);
      // The builder deletes a replaced file in the same PR (briefs/builder-picture.md); once it is
      // actually gone, "open" (still to switch over) is stale — retire it instead of leaving a
      // caller-facing decision that already happened unrecorded (fix round, I14).
      for (const r of entry.replaces ?? []) {
        if (r.state === 'open' && !existsSync(join(ctx.repoRoot, r.file))) {
          r.state = 'retired';
          ctx.out.line(`${r.file}: retired (the file no longer exists)`);
        }
      }
    }
    if (markBuilt.length) await writeComponentsMap(path, map);

    const problems = validateComponentsMap(map, { repoRoot: ctx.repoRoot });
    for (const p of problems) ctx.out.fail('components', p);

    // The export, when one is available, is compared in memory only: this command never writes
    // components.json for the drift it finds (intake, a later slice, is what records it for real).
    const exportDir = values.export ?? ctx.paths?.designSnapshot ?? null;
    const exportAvailable = Boolean(exportDir && existsSync(exportDir));
    let effectiveDesign = map.components.filter((c) => c.kind === 'design'); // "today" (no export): the persisted view
    const missingFromMap = [];
    const reported = new Set();
    let exportErrorCount = 0;

    if (exportAvailable) {
      const { components: exported, errors } = await readExportComponents(exportDir);
      exportErrorCount = errors.length;
      for (const e of errors) ctx.out.fail('components', e);

      const before = new Map(map.components.filter((c) => c.kind === 'design').map((c) => [c.name, c]));
      const refreshed = refreshDesignEntries(map, exported);
      effectiveDesign = refreshed.map.components.filter((c) => c.kind === 'design');
      for (const name of refreshed.changed) {
        const prev = before.get(name);
        const now = effectiveDesign.find((c) => c.name === name);
        if (!prev) {
          missingFromMap.push(name);
          ctx.out.fail('components', `${name}: not in the map yet`);
          reported.add(name);
        } else if (prev.status !== now.status) {
          ctx.out.fail('components', `${name}: ${prev.status} -> ${now.status} (the design file changed)`);
          reported.add(name);
        }
      }
    }

    const stale = effectiveDesign.filter((c) => c.status === 'stale');
    for (const c of stale) if (!reported.has(c.name)) ctx.out.fail('components', `${c.name}: the design changed since it was built (stale)`);

    let missingBase = [];
    if (profile.components?.baseDir) {
      const designTargets = new Set(effectiveDesign.filter((c) => c.target).map((c) => c.target));
      const fresh = scanBase(ctx.repoRoot, profile.components.baseDir, profile.components.baseLibraries ?? [], designTargets);
      const haveTargets = new Set(map.components.filter((c) => c.kind === 'base').map((c) => c.target));
      missingBase = fresh.filter((c) => !haveTargets.has(c.target));
      for (const c of missingBase) ctx.out.fail('components', `${c.target}: no base entry yet (run delivery components --scan-base)`);
    }

    let nextLine = null;
    if (exportAvailable) {
      const manifestPath = findDesignSystemManifest(exportDir);
      if (manifestPath) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const missing = missingFromDesignSystem(map, manifest.components ?? []);
        if (missing.length) nextLine = `run /design-sync on the design-system project: it lacks ${missing.join(', ')}`;
      }
    }

    const byName = new Map(effectiveDesign.map((c) => [c.name, c]));
    let designOrder;
    let cycle = false;
    try {
      designOrder = componentOrder(effectiveDesign).map((name) => byName.get(name)).filter(Boolean);
    } catch (err) {
      cycle = true;
      ctx.out.fail('components', err.message);
      designOrder = [...effectiveDesign].sort((a, b) => a.name.localeCompare(b.name));
    }
    const baseSorted = map.components.filter((c) => c.kind === 'base').sort((a, b) => a.name.localeCompare(b.name));
    for (const c of designOrder) ctx.out.line(`design ${c.name}: ${c.status}${c.target ? ` -> ${c.target}` : ' (no target)'}`);
    for (const c of baseSorted) ctx.out.line(`base ${c.name}: ${c.target} (${(c.owns ?? []).join(', ') || 'no library'})`);
    if (nextLine) ctx.out.line(`NEXT: ${nextLine}`);

    ctx.out.set('components', {
      total: map.components.length, stale: stale.length, missingBase: missingBase.length,
      missingFromMap: missingFromMap.length, problems: problems.length, exportErrors: exportErrorCount,
      cycle, next: nextLine,
    });
    const exit = problems.length || stale.length || missingBase.length || missingFromMap.length || exportErrorCount || cycle ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'components', exit, counts: { total: map.components.length, problems: problems.length } });
    return exit;
  },
});
