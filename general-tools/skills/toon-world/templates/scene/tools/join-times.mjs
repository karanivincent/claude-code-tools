#!/usr/bin/env node
// __SLUG__: write the film second of every join, in the form toon-video's scripts/loop/joins.sh reads:
//   [{ "at": 7.2, "from": "s01", "to": "s02", "kind": "cut" | "swing" }]
// "cut" when the join card says cut: true (a new place or angle on purpose), else "swing" (the camera carries over).
//   node src/stories/__SLUG__/tools/join-times.mjs > out/__SLUG__/join-times.json
import fs from 'node:fs';
import path from 'node:path';
import { loadFilm, SLUG } from './lib.mjs';

const film = await loadFilm();
const file = path.resolve('stories', SLUG, 'joins.json');
const cards = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')).joins ?? []) : [];
const out = [];
for (let i = 1; i < film.SCENES.length; i++) {
  const from = film.SCENES[i - 1].id, to = film.SCENES[i].id;
  const card = cards.find((j) => j.after === from && j.before === to);
  out.push({ at: Math.round((film.sceneFrom(to) / film.FPS) * 1000) / 1000, from, to, kind: card?.cut ? 'cut' : 'swing', why: card ? 'join card' : 'no join card yet' });
}
console.log(JSON.stringify(out, null, 2));
