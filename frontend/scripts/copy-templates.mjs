// Copies the Markdown templates the renderer needs from the repo-root corpus
// into public/, where the static export serves them. Keeps `templates/` the
// single source of truth instead of committing a second copy under frontend/.

import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(here, '..', '..', 'templates');
const DEST = path.resolve(here, '..', 'public', 'templates');

// The MNDA is the only document the prototype renders today.
const WANTED = /^Mutual-NDA.*\.md$/;

const names = (await readdir(SOURCE)).filter((n) => WANTED.test(n));
if (names.length === 0) {
  throw new Error(`No templates matching ${WANTED} found in ${SOURCE}`);
}

await mkdir(DEST, { recursive: true });
for (const name of names) {
  await copyFile(path.join(SOURCE, name), path.join(DEST, name));
}
console.log(`Copied ${names.length} template(s) to public/templates/`);
