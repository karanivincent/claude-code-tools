// The clock every command reads time from, so tests can freeze it (tests/helpers/clock.mjs).

/**
 * @typedef {{ now(): Date, iso(): string }} Clock
 */

/** @type {Clock} */
export const systemClock = Object.freeze({
  now: () => new Date(),
  iso: () => new Date().toISOString(),
});

/** "2026-01-31" for a clock, in UTC. Used for {date} in handover and decision paths. */
export function isoDate(clock) {
  return clock.now().toISOString().slice(0, 10);
}
