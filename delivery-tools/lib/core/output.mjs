// Command output. Human mode prints one line per failure as it happens; --json mode
// collects everything and prints a single JSON object when the command finishes.

/**
 * @typedef {{ code: string, message: string }} Failure
 * @typedef {object} Output
 * @property {boolean} json
 * @property {(text: string) => void} line      a human line (collected under "lines" in --json mode)
 * @property {(code: string, message: string) => void} fail  one line per failure: "FAIL <code> <message>"
 * @property {(message: string) => void} warn   always stderr: "WARN <message>"
 * @property {(key: string, value: unknown) => void} set    a --json payload field
 * @property {() => Failure[]} failures
 * @property {(exit: number) => number} finish prints the --json object; returns exit unchanged
 */

/**
 * @param {{ json?: boolean, stdout?: { write(s: string): unknown }, stderr?: { write(s: string): unknown } }} [opts]
 * @returns {Output}
 */
export function createOutput(opts = {}) {
  const json = Boolean(opts.json);
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  /** @type {Failure[]} */
  const failures = [];
  const lines = [];
  const data = {};
  let finished = false;

  return {
    json,
    line(text) {
      for (const l of String(text).split('\n')) {
        if (json) lines.push(l);
        else stdout.write(l + '\n');
      }
    },
    fail(code, message) {
      const one = oneLine(message);
      failures.push({ code, message: one });
      if (!json) stdout.write(`FAIL ${code} ${one}\n`);
    },
    warn(message) {
      stderr.write(`WARN ${oneLine(message)}\n`);
    },
    set(key, value) {
      data[key] = value;
    },
    failures() {
      return failures.slice();
    },
    finish(exit) {
      if (finished) return exit;
      finished = true;
      if (json) {
        stdout.write(JSON.stringify({ ok: exit === 0, exit, failures, lines, data }) + '\n');
      }
      return exit;
    },
  };
}

/** Collapse whitespace so a message is always exactly one line. */
export function oneLine(message) {
  return String(message).replace(/\s*\n\s*/g, ' ').trim();
}
