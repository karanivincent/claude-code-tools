import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// pageExtract runs only inside a browser, so this pins the rule in its source. A date field's
// value is wire format ("2025-09-30") the browser redraws in its own locale; read as page copy it
// failed the numeric-date lint on a product that shows the date correctly (knowledge-page run,
// 2026-09-25), and the builder's only way round it was hiding the field from screen readers.
test('date and time fields contribute no text', () => {
  const src = readFileSync(new URL('../../lib/capture/page-extract.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function fieldText'), src.indexOf('function accName'));
  assert.match(body, /\['date', 'datetime-local', 'month', 'week', 'time'\]\.includes\(t\)\) return ''/);
  assert.ok(body.indexOf("'datetime-local'") < body.lastIndexOf('collapse(el.value) || collapse(el.placeholder)'),
    'the date rule must come before the generic value line');
});
