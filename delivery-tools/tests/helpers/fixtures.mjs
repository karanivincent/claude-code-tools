// Synthetic fixtures: generic on purpose (a fictional "example-org/example-repo" and a feature
// named "widgets"). Nothing here may name a real project, person, number or URL.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Parse tests/fixtures/<rel>. */
export function loadFixture(rel) {
  const text = readFileSync(join(FIXTURES_DIR, rel), 'utf8');
  return rel.endsWith('.json') ? JSON.parse(text) : text;
}

/** A fresh copy of the valid synthetic example for a schema (tests/fixtures/schemas/<name>.valid.json). */
export function validExample(name) {
  return loadFixture(`schemas/${name}.valid.json`);
}

/** A valid profile; pass overrides to change top-level sections. */
export function makeProfile(overrides = {}) {
  return { ...validExample('profile'), ...overrides };
}

/** A valid safety file; pass overrides to change top-level fields. */
export function makeSafety(overrides = {}) {
  return { ...validExample('safety'), ...overrides };
}

/** A 40-hex git SHA made of one repeated character, for readability in tests. */
export function sha(ch = 'a') {
  return ch.repeat(40);
}

/** A 64-hex sha256 made of one repeated character. */
export function sha256Of(ch = '0') {
  return ch.repeat(64);
}
