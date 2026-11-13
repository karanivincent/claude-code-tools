#!/usr/bin/env node
// The ElevenLabs balance before and after a story (S6-9): characters used and the month's limit, never the key.
//   node --env-file=<secrets.env> eleven-balance.mjs [--log <file>]
// Reads ELEVENLABS_API_KEY from the environment (hand the secrets file to node with --env-file: X-1). --log appends
// the line to a file (the story's checklist or log), so before and after sit side by side.
import fs from 'node:fs';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('eleven-balance: ELEVENLABS_API_KEY is not set (node --env-file=<secrets.env> ...)'); process.exit(1); }
const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } });
if (!r.ok) { console.error(`eleven-balance: ElevenLabs answered ${r.status}`); process.exit(1); }
const j = await r.json();
const line = `${new Date().toISOString()} ElevenLabs used ${j.character_count} of ${j.character_limit} (${j.character_limit - j.character_count} left)`;
console.log(line);
const i = process.argv.indexOf('--log');
if (i > 0 && process.argv[i + 1]) fs.appendFileSync(process.argv[i + 1], line + '\n');
