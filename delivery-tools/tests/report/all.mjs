// Node 22+ treats `node --test tests/<area>/` as a module path, not a directory to search; this
// package's main imports every *.test.mjs here so that command runs the whole suite on every
// Node from 20 up. Node 20 searches the directory itself and never loads this file.
import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  await import(pathToFileURL(`${dir}/${f}`).href);
}
