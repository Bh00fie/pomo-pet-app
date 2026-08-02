/*
 * Stitches docs/previews/src/*.html into standalone, self-contained pages in docs/previews/.
 *
 * Every preview has to work with no network access at all (the Artifact CSP blocks every
 * external host, and a DesignSync card is read on its own), so shared CSS and the renderer are
 * inlined rather than linked. This script is the reason there is only one copy of each to edit.
 *
 *   node docs/previews/build.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');

const INCLUDE = /<!--\s*@include\s+([\w.-]+)\s*-->/g;

function expand(html, seen = new Set()) {
  return html.replace(INCLUDE, (_, name) => {
    if (seen.has(name)) throw new Error(`circular @include: ${name}`);
    const body = readFileSync(join(src, name), 'utf8');
    return expand(body, new Set([...seen, name]));
  });
}

mkdirSync(here, { recursive: true });

const pages = readdirSync(src).filter((f) => f.endsWith('.html'));
for (const page of pages) {
  const out = expand(readFileSync(join(src, page), 'utf8'));
  writeFileSync(join(here, page), out);
  console.log(`${page.padEnd(28)} ${(out.length / 1024).toFixed(1)} KB`);
}
console.log(`\n${pages.length} previews built into docs/previews/`);
