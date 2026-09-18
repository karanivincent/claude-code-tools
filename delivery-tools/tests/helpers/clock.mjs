// A fake clock: frozen until advanced.

/**
 * @param {string} [startIso]
 * @returns {{ now(): Date, iso(): string, advance(ms: number): void, set(iso: string): void }}
 */
export function fakeClock(startIso = '2026-01-15T20:00:00.000Z') {
  let t = Date.parse(startIso);
  return {
    now: () => new Date(t),
    iso: () => new Date(t).toISOString(),
    advance(ms) { t += ms; },
    set(iso) { t = Date.parse(iso); },
  };
}
