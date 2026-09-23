// Builds the deployable site into dist/: only the files the browser needs,
// never tests, tooling or git history.

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = 'dist';
const FILES = ['index.html', 'css', 'js'];

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  // not a git checkout: keep "unknown"
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT);
for (const f of FILES) await cp(f, `${OUT}/${f}`, { recursive: true });

// Lets anyone check which version a server is running: GET /version.json
const info = { version, commit, builtAt: new Date().toISOString() };
await writeFile(`${OUT}/version.json`, JSON.stringify(info, null, 2) + '\n');

console.log(`Built v${version} (${commit}) into ${OUT}/`);
