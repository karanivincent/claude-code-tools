// Exit codes shared by every command (spec section 16).

export const EXIT = Object.freeze({
  PASS: 0, // everything checked is green
  RED: 1, // a check failed; the output says which
  USAGE: 2, // usage or configuration error (also: not implemented)
  BLOCKED: 3, // blocked on the founder (a red-circle item)
  WAIT: 4, // wait and retry: CI pending, allowance spent, preview not ready
  INCONSISTENT: 5, // broken journal, manifest mismatch, tampered artefact
});

/** An error that carries the exit code the CLI must end with. */
export class DeliveryError extends Error {
  /**
   * @param {number} exit one of EXIT
   * @param {string} message one line, no trailing period needed
   * @param {{ code?: string, failures?: { code: string, message: string }[] }} [opts]
   */
  constructor(exit, message, opts = {}) {
    super(message);
    this.name = 'DeliveryError';
    this.exit = exit;
    this.code = opts.code ?? codeForExit(exit);
    this.failures = opts.failures ?? [{ code: this.code, message }];
  }
}

export class UsageError extends DeliveryError {
  constructor(message, opts) { super(EXIT.USAGE, message, { code: 'usage', ...opts }); this.name = 'UsageError'; }
}
export class ConfigError extends DeliveryError {
  constructor(message, opts) { super(EXIT.USAGE, message, { code: 'config', ...opts }); this.name = 'ConfigError'; }
}
export class BlockedError extends DeliveryError {
  constructor(message, opts) { super(EXIT.BLOCKED, message, { code: 'blocked', ...opts }); this.name = 'BlockedError'; }
}
export class WaitError extends DeliveryError {
  constructor(message, opts) { super(EXIT.WAIT, message, { code: 'wait', ...opts }); this.name = 'WaitError'; }
}
export class InconsistencyError extends DeliveryError {
  constructor(message, opts) { super(EXIT.INCONSISTENT, message, { code: 'inconsistent', ...opts }); this.name = 'InconsistencyError'; }
}

/**
 * The error a not-yet-built command or cross-slice function throws.
 * @param {string} slice owning slice, e.g. "A1"
 * @param {string} [what] function or command name
 */
export function notImplementedError(slice, what) {
  const msg = what ? `not implemented (slice ${slice}): ${what}` : `not implemented (slice ${slice})`;
  return new DeliveryError(EXIT.USAGE, msg, { code: 'not-implemented' });
}

function codeForExit(exit) {
  switch (exit) {
    case EXIT.RED: return 'red';
    case EXIT.USAGE: return 'usage';
    case EXIT.BLOCKED: return 'blocked';
    case EXIT.WAIT: return 'wait';
    case EXIT.INCONSISTENT: return 'inconsistent';
    default: return 'error';
  }
}

/**
 * The exit code for a list of gate results: the most serious wins.
 * Order of precedence: 5 > 2 > 3 > 4 > 1 > 0.
 * @param {number[]} codes
 */
export function worstExit(codes) {
  const rank = { 5: 6, 2: 5, 3: 4, 4: 3, 1: 2, 0: 1 };
  let worst = 0;
  for (const c of codes) if ((rank[c] ?? 2) > (rank[worst] ?? 0)) worst = c;
  return worst;
}
