// What a Bash command does, for the pre-bash hook (spec 11.4): does it mark a PR ready for review,
// and is it a raw seed command? Pure. The shell fast path only lets a command through to here when
// its text mentions one of them; this lexer decides precisely, so quoted text ("fix the seed" in a
// commit message, a heredoc body) never counts, and $(...), `...`, sh -c and eval are looked into.

const MAX_DEPTH = 4;

/** Index just past the ')' matching the '(' at str[open]; quotes and nesting respected. */
function closeParen(str, open) {
  let depth = 0;
  for (let j = open; j < str.length; j++) {
    const c = str[j];
    if (c === '\\') { j++; continue; }
    if (c === "'") { const k = str.indexOf("'", j + 1); if (k < 0) throw new Error('unbalanced quote'); j = k; continue; }
    if (c === '"') { j = closeDouble(str, j) - 1; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return j + 1; }
  }
  throw new Error('unbalanced parenthesis');
}

/** Index just past the '"' that closes the one at str[open]. */
function closeDouble(str, open) {
  for (let j = open + 1; j < str.length; j++) {
    const c = str[j];
    if (c === '\\') { j++; continue; }
    if (c === '"') return j + 1;
    if (c === '$' && str[j + 1] === '(') { j = closeParen(str, j + 1) - 1; continue; }
    if (c === '`') { const k = str.indexOf('`', j + 1); if (k < 0) throw new Error('unbalanced backtick'); j = k; }
  }
  throw new Error('unbalanced quote');
}

/** The command substitutions inside double-quoted text, as inner command strings. */
function substitutionsIn(text) {
  const subs = [];
  for (let j = 0; j < text.length; j++) {
    if (text[j] === '\\') { j++; continue; }
    if (text[j] === '$' && text[j + 1] === '(' && text[j + 2] !== '(') {
      const stop = closeParen(text, j + 1);
      subs.push(text.slice(j + 2, stop - 1));
      j = stop - 1;
    } else if (text[j] === '`') {
      const k = text.indexOf('`', j + 1);
      if (k < 0) throw new Error('unbalanced backtick');
      subs.push(text.slice(j + 1, k));
      j = k;
    }
  }
  return subs;
}

/**
 * Split shell text into words, operators and redirections. Quotes are removed from words; a word
 * keeps the raw text of any $(...) or `...` in it, and the inner command text is collected in
 * `subs`. Heredoc bodies are skipped. Throws on unbalanced quotes or substitutions.
 * @param {string} s
 * @returns {{ tokens: { t: 'w'|'op'|'redir', v: string }[], subs: string[] }}
 */
export function lex(s) {
  const tokens = [];
  const subs = [];
  const heredocs = [];
  const n = s.length;
  let cur = null;
  let i = 0;
  const end = () => { if (cur !== null) { tokens.push({ t: 'w', v: cur }); cur = null; } };
  const add = (text) => { cur = (cur ?? '') + text; };
  const skipHeredocBodies = () => {
    while (heredocs.length) {
      const { delim, strip } = heredocs.shift();
      while (i < n) {
        const nl = s.indexOf('\n', i);
        const line = s.slice(i, nl < 0 ? n : nl);
        i = nl < 0 ? n : nl + 1;
        if ((strip ? line.replace(/^\t+/, '') : line) === delim) break;
      }
    }
  };

  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\r') { end(); i++; continue; }
    if (c === '\n') { end(); tokens.push({ t: 'op', v: ';' }); i++; skipHeredocBodies(); continue; }
    if (c === '#' && cur === null) { const nl = s.indexOf('\n', i); i = nl < 0 ? n : nl; continue; }
    if (c === '\\') {
      if (s[i + 1] !== '\n' && i + 1 < n) add(s[i + 1]);
      i += 2;
      continue;
    }
    if (c === "'") {
      const k = s.indexOf("'", i + 1);
      if (k < 0) throw new Error('unbalanced quote');
      add(s.slice(i + 1, k));
      i = k + 1;
      continue;
    }
    if (c === '"') {
      const stop = closeDouble(s, i);
      const inner = s.slice(i + 1, stop - 1);
      subs.push(...substitutionsIn(inner));
      add(inner.replace(/\\\n/g, '').replace(/\\(["\\$`])/g, '$1'));
      i = stop;
      continue;
    }
    if (c === '$' && s[i + 1] === '(') {
      const stop = closeParen(s, i + 1);
      if (s[i + 2] !== '(') subs.push(s.slice(i + 2, stop - 1));
      add(s.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '`') {
      const k = s.indexOf('`', i + 1);
      if (k < 0) throw new Error('unbalanced backtick');
      subs.push(s.slice(i + 1, k));
      add(s.slice(i, k + 1));
      i = k + 1;
      continue;
    }
    if (c === '<' || c === '>') {
      if (cur !== null && /^\d+$/.test(cur)) cur = null; // an fd number, as in 2>
      end();
      let op = c;
      i++;
      while (i < n && '<>&|-'.includes(s[i]) && op.length < 3) op += s[i++];
      if (op.startsWith('<<') && !op.startsWith('<<<')) {
        while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
        let delim = '';
        while (i < n && !' \t\n;&|<>()'.includes(s[i])) {
          if (s[i] === "'" || s[i] === '"') {
            const k = s.indexOf(s[i], i + 1);
            if (k < 0) throw new Error('unbalanced quote');
            delim += s.slice(i + 1, k);
            i = k + 1;
          } else {
            if (s[i] !== '\\') delim += s[i];
            i++;
          }
        }
        heredocs.push({ delim, strip: op === '<<-' });
        continue;
      }
      if (op.endsWith('&') && /[0-9-]/.test(s[i] ?? '')) { while (i < n && /[0-9-]/.test(s[i])) i++; continue; }
      tokens.push({ t: 'redir', v: op });
      continue;
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
      end();
      const two = s.slice(i, i + 2);
      if (two === '&&' || two === '||' || two === ';;' || two === '|&') { tokens.push({ t: 'op', v: two }); i += 2; continue; }
      tokens.push({ t: 'op', v: c });
      i++;
      continue;
    }
    add(c);
    i++;
  }
  end();
  return { tokens, subs };
}

/** Simple commands (arrays of words), redirect targets removed. */
export function simpleCommands(tokens) {
  const out = [];
  let words = [];
  let skipNext = false;
  for (const tk of tokens) {
    if (tk.t === 'op') { if (words.length) out.push(words); words = []; skipNext = false; continue; }
    if (tk.t === 'redir') { skipNext = true; continue; }
    if (skipNext) { skipNext = false; continue; }
    words.push(tk.v);
  }
  if (words.length) out.push(words);
  return out;
}

const base = (w) => String(w).split('/').pop();
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);

/** Drop env assignments and wrappers (env, command, exec, nohup, time, nice, sudo, timeout, xargs). */
export function unwrap(words) {
  const w = [...words];
  for (let guard = 0; guard < 8 && w.length; guard++) {
    while (w.length && ASSIGN.test(w[0])) w.shift();
    const b = base(w[0] ?? '');
    if (['command', 'exec', 'nohup', 'time', 'builtin'].includes(b)) { w.shift(); continue; }
    if (b === 'env' || b === 'sudo' || b === 'nice' || b === 'xargs') {
      w.shift();
      while (w.length && (w[0].startsWith('-') || ASSIGN.test(w[0]))) {
        const flag = w.shift();
        if (['-u', '-n', '-g', '-C', '-I', '-L', '-P', '-s', '-S'].includes(flag) && w.length) w.shift();
      }
      continue;
    }
    if (b === 'timeout') {
      w.shift();
      while (w.length && w[0].startsWith('-')) { const f = w.shift(); if (['-s', '-k', '--signal', '--kill-after'].includes(f)) w.shift(); }
      w.shift(); // the duration
      continue;
    }
    break;
  }
  return w;
}

/** A gh pr target: a number, "#12", a pull URL or a branch name; none means the current branch. */
export function parseTarget(target, repo = null) {
  if (target === null || target === undefined || target === '') return { pr: null, url: null, branch: null, repo, current: true };
  const num = String(target).match(/^#?(\d+)$/);
  if (num) return { pr: Number(num[1]), url: null, branch: null, repo, current: false };
  const url = String(target).match(/^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (url) return { pr: Number(url[2]), url: String(target), branch: null, repo: repo ?? url[1], current: false };
  return { pr: null, url: null, branch: String(target), repo, current: false };
}

/**
 * gh pr ready's target, or null when the words are not a `gh pr ready` that marks a PR ready
 * (--undo turns a PR back into a draft; --help changes nothing).
 * @returns {ReturnType<typeof parseTarget>|null}
 */
export function ghPrReady(words) {
  if (base(words[0] ?? '') !== 'gh' || words[1] !== 'pr' || words[2] !== 'ready') return null;
  const args = words.slice(3);
  let target = null;
  let repo = null;
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (a === '--undo' || a === '-h' || a === '--help') return null;
    if (a === '-R' || a === '--repo') { repo = args[++j] ?? null; continue; }
    if (a.startsWith('--repo=')) { repo = a.slice(7); continue; }
    if (a.startsWith('-')) continue;
    if (target === null) target = a;
  }
  return parseTarget(target, repo);
}

const READY_API = /ready_for_review|markPullRequestReadyForReview/;

/** gh api with ready_for_review or markPullRequestReadyForReview anywhere in its arguments. */
export function ghApiReady(words) {
  return base(words[0] ?? '') === 'gh' && words[1] === 'api' && words.slice(2).some((w) => READY_API.test(w));
}

const INTERPRETERS = new Set(['node', 'nodejs', 'tsx', 'ts-node', 'bun', 'deno', 'python', 'python3', 'ruby', 'php', 'perl', 'bash', 'sh', 'zsh', 'dash']);
const INTERP_VALUE_FLAGS = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader', '--env-file', '--conditions', '-C', '--input-type', '--title', '-m']);
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const PM_VALUE_FLAGS = new Set(['--filter', '-F', '--dir', '-C', '--prefix', '--cwd', '--workspace', '-w', '--loglevel', '--reporter']);
const NOT_EXECUTING = new Set(['git', 'grep', 'rg', 'ag', 'ack', 'cat', 'less', 'more', 'head', 'tail', 'sed', 'awk', 'ls', 'find', 'echo',
  'printf', 'wc', 'diff', 'jq', 'code', 'vim', 'vi', 'nano', 'open', 'file', 'stat', 'cp', 'mv', 'rm', 'trash', 'mkdir', 'touch', 'test', '[',
  'gh', 'sort', 'uniq', 'tee', 'xxd', 'shasum', 'sha256sum', 'md5', 'basename', 'dirname', 'realpath', 'readlink', 'chmod', 'ln', 'tar',
  'zip', 'unzip', 'curl', 'wget']);
const SEED_NAME = /seed/i;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//;
const SEED_SUBCOMMAND = /^(db:)?seeds?(:[A-Za-z-]+)?$|^seed:/i;

/** The delivery CLI itself: `delivery seed` is the one allowed writer of fixture rows. */
function isDelivery(words) {
  const b = base(words[0] ?? '');
  if (b === 'delivery' || b === 'delivery.mjs') return true;
  if (b === 'node' || b === 'nodejs') {
    const script = words.slice(1).find((w) => !w.startsWith('-'));
    return Boolean(script && base(script) === 'delivery.mjs');
  }
  return false;
}

/** The script an interpreter would run, skipping its own flags; null for -e, -c or --test. */
function interpreterScript(words) {
  for (let j = 1; j < words.length; j++) {
    const a = words[j];
    if (['--test', '-e', '--eval', '-p', '--print', '-c'].includes(a)) return null;
    if (a === 'run' && ['bun', 'deno'].includes(base(words[0]))) continue;
    if (INTERP_VALUE_FLAGS.has(a)) { j++; continue; }
    if (a.startsWith('-')) continue;
    return a;
  }
  return null;
}

/** The words after a package manager's own flags. */
function packageWords(words) {
  const rest = [];
  for (let j = 1; j < words.length; j++) {
    const a = words[j];
    if (PM_VALUE_FLAGS.has(a)) { j++; continue; }
    if (a.startsWith('-')) continue;
    rest.push(a);
  }
  return rest;
}

/**
 * Why a simple command is a raw seed command, or null. `sh -c` and `eval` are handled by
 * classifyBash, which lexes their script.
 * @param {string[]} words already unwrapped
 */
export function seedReason(words) {
  if (!words.length || isDelivery(words)) return null;
  const b = base(words[0]);
  if (INTERPRETERS.has(b)) {
    if ((b === 'node' || b === 'nodejs') && words.some((w, j) => ['-e', '--eval', '-p', '--print'].includes(w) && SEED_NAME.test(words[j + 1] ?? ''))) return 'inline code that seeds';
    const script = interpreterScript(words);
    if (script && SEED_NAME.test(base(script)) && !TEST_FILE.test(script)) return `runs ${script}`;
    return null;
  }
  if (PACKAGE_MANAGERS.has(b)) {
    const rest = packageWords(words);
    if (rest[0] === 'exec' || rest[0] === 'dlx' || (b === 'bun' && rest[0] === 'x')) return seedReason(rest.slice(1));
    const script = rest[0] === 'run' || rest[0] === 'run-script' ? rest[1] : rest[0];
    if (script && SEED_NAME.test(script) && !TEST_FILE.test(script)) return `runs the package script ${script}`;
    return null;
  }
  if (b === 'npx' || b === 'pnpx') return seedReason(words.slice(1).filter((w) => !w.startsWith('-')));
  if (['psql', 'mysql', 'sqlite3'].includes(b)) {
    for (let j = 1; j < words.length; j++) {
      const a = words[j];
      const file = a === '-f' || a === '--file' ? words[j + 1] : a.startsWith('--file=') ? a.slice(7) : null;
      if (file && SEED_NAME.test(base(file))) return `runs ${file}`;
    }
    return null;
  }
  if (NOT_EXECUTING.has(b)) return null;
  if (words[0].includes('/') && SEED_NAME.test(b) && !TEST_FILE.test(words[0])) return `runs ${words[0]}`;
  const sub = words.slice(1, 3).filter((w) => !w.startsWith('-')).find((w) => SEED_SUBCOMMAND.test(w));
  return sub ? `${b} ${sub}` : null;
}

/** The script a shell -c or an eval runs, or null. */
function innerScript(words) {
  const b = base(words[0] ?? '');
  if (b === 'eval') return words.slice(1).join(' ');
  if (SHELLS.has(b) && words.includes('-c')) return words[words.indexOf('-c') + 1] ?? null;
  return null;
}

/**
 * @param {string} text the Bash tool's command
 * @returns {{ ready: ReturnType<typeof parseTarget>[], readyApi: boolean, seed: string|null, unparsed: boolean }}
 */
export function classifyBash(text) {
  const out = { ready: [], readyApi: false, seed: null, unparsed: false };
  const visit = (src, depth) => {
    if (depth > MAX_DEPTH) return;
    let lexed;
    try {
      lexed = lex(src);
    } catch {
      out.unparsed = true;
      fallback(src, out);
      return;
    }
    for (const raw of simpleCommands(lexed.tokens)) {
      const words = unwrap(raw);
      if (!words.length) continue;
      const inner = innerScript(words);
      if (inner !== null) { visit(inner, depth + 1); continue; }
      const target = ghPrReady(words);
      if (target) out.ready.push(target);
      if (ghApiReady(words)) out.readyApi = true;
      const why = seedReason(words);
      if (why && !out.seed) out.seed = `${words.join(' ')} (${why})`.slice(0, 200);
    }
    for (const sub of lexed.subs) visit(sub, depth + 1);
  };
  visit(String(text ?? ''), 0);
  return out;
}

/** When the text cannot be lexed: patterns on the raw text, erring towards a check. */
function fallback(src, out) {
  if (/\bgh\s+pr\s+ready\b/.test(src) && !/--undo\b/.test(src)) out.ready.push(parseTarget(null));
  if (/\bgh\s+api\b[\s\S]*(ready_for_review|markPullRequestReadyForReview)/.test(src)) out.readyApi = true;
  if (!out.seed && !/delivery(\.mjs)?\s+seed\b/.test(src)) {
    const m = src.match(/\b(?:node|tsx|ts-node|bun|deno|python3?|ruby|bash|sh)\s+(?:-\S+\s+)*([^\s;&|'"]*seed[^\s;&|'"]*)/i)
      ?? src.match(/\b(?:npm|pnpm|yarn)\b[^\n;&|]*?\b((?:db:)?seed[\w:-]*)/i);
    if (m && !TEST_FILE.test(m[1])) out.seed = `${m[0].trim()} (unparsed command)`.slice(0, 200);
  }
}
