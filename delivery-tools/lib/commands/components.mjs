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
  scanBase, missingFromDesignSystem, findDesignSystemManifest,
} from '../components/map.mjs';

export default defineCommand({
  name: 'components',
  summary: 'The component map, checked against the repo and the design system export',
  usage: `usage: delivery components [--scan-base] [--mark-built <Name>]... [--export <dir>]

Product-wide, not a run: prints docs/delivery/components.json (profile.components.map), each
entry's status, checked against the repo. Needs no --feature. With no profile.components block,
prints that components are not configured and exits 0.

--scan-base rewrites every "kind": "base" entry from profile.components.baseDir, recording which
of profile.components.baseLibraries each file imports (a trailing /* matches any subpath). Design
entries are left untouched. Creates the map when it does not exist yet.

--mark-built <Name> sets a design entry's builtHash to its current design hash and its status to
built. Refused (exit 2) when the entry has no target yet, or its target is missing on disk. May
be repeated.

--export <dir> is a design export directory to compare the map against (its
_ds/*/_ds_manifest.json); when a run is resolved in this worktree its own design snapshot is used
instead. With neither, the design-system comparison is skipped.

exit: 0 configured and every check passes; 1 a design entry is stale, a file in baseDir has no
      base entry, or validateComponentsMap finds a problem; 2 usage, or no components.json to
      work with

common options:
  --feature <slug>   only used, if a run is resolved, to find its design snapshot
  --json             machine output: one JSON object on stdout
  --help             this text`,
  async run(ctx, argv) {
    const { values } = parseCommandArgs(argv, {
      options: {
        'scan-base': { type: 'boolean' },
        'mark-built': { type: 'string', multiple: true },
        export: { type: 'string' },
      },
    });
    const profile = await ctx.profile();
    const path = componentsMapPath(ctx.repoRoot, profile);
    if (!path) {
      ctx.out.line('components are not configured (no profile.components block)');
      return EXIT.PASS;
    }

    let map = await readComponentsMap(path);

    if (values['scan-base']) {
      if (!profile.components.baseDir) throw new UsageError('profile.components.baseDir is not set; add it before running --scan-base');
      const base = scanBase(ctx.repoRoot, profile.components.baseDir, profile.components.baseLibraries ?? []);
      const design = (map?.components ?? []).filter((c) => c.kind === 'design');
      map = { version: 1, allowOwns: map?.allowOwns ?? [], components: [...design, ...base] };
      await writeComponentsMap(path, map);
      ctx.out.line(`scanned ${profile.components.baseDir}: ${base.length} base component(s)`);
    }

    if (!map) {
      throw new UsageError(`no components map at ${path}; the mapper writes it (briefs/components-mapper.md), or run delivery components --scan-base to start one`);
    }

    const markBuilt = values['mark-built'] ?? [];
    for (const name of markBuilt) {
      const entry = map.components.find((c) => c.kind === 'design' && c.name === name);
      if (!entry) throw new UsageError(`no design component named "${name}"`);
      if (!entry.target) throw new UsageError(`${name} has no target yet; the mapper must set one before it can be marked built`);
      if (!existsSync(join(ctx.repoRoot, entry.target))) throw new UsageError(`${name}: target ${entry.target} does not exist on disk`);
      entry.builtHash = entry.design.hash;
      entry.status = 'built';
      ctx.out.line(`marked ${name} built at ${entry.design.hash}`);
    }
    if (markBuilt.length) await writeComponentsMap(path, map);

    const problems = validateComponentsMap(map, { repoRoot: ctx.repoRoot });
    for (const p of problems) ctx.out.fail('components', p);

    const stale = map.components.filter((c) => c.kind === 'design' && c.status === 'stale');
    for (const c of stale) ctx.out.fail('components', `${c.name}: the design changed since it was built (stale)`);

    let missingBase = [];
    if (profile.components?.baseDir) {
      const fresh = scanBase(ctx.repoRoot, profile.components.baseDir, profile.components.baseLibraries ?? []);
      const haveTargets = new Set(map.components.filter((c) => c.kind === 'base').map((c) => c.target));
      missingBase = fresh.filter((c) => !haveTargets.has(c.target));
      for (const c of missingBase) ctx.out.fail('components', `${c.target}: no base entry yet (run delivery components --scan-base)`);
    }

    let nextLine = null;
    const exportDir = values.export ?? ctx.paths?.designSnapshot ?? null;
    if (exportDir && existsSync(exportDir)) {
      const manifestPath = findDesignSystemManifest(exportDir);
      if (manifestPath) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const missing = missingFromDesignSystem(map, manifest.components ?? []);
        if (missing.length) nextLine = `run /design-sync on the design-system project: it lacks ${missing.join(', ')}`;
      }
    }

    const sorted = [...map.components].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    for (const c of sorted) {
      if (c.kind === 'design') ctx.out.line(`design ${c.name}: ${c.status}${c.target ? ` -> ${c.target}` : ' (no target)'}`);
      else ctx.out.line(`base ${c.name}: ${c.target} (${(c.owns ?? []).join(', ') || 'no library'})`);
    }
    if (nextLine) ctx.out.line(`NEXT: ${nextLine}`);

    ctx.out.set('components', {
      total: map.components.length, stale: stale.length, missingBase: missingBase.length, problems: problems.length,
      next: nextLine,
    });
    const exit = problems.length || stale.length || missingBase.length ? EXIT.RED : EXIT.PASS;
    await ctx.journal({ command: 'components', exit, counts: { total: map.components.length, problems: problems.length } });
    return exit;
  },
});
