// Builds the deployable site into dist/: only the files the browser needs,
// never tests, tooling or git history.

import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const OUT = 'dist';
const FILES = ['index.html', 'css', 'js', 'icons', 'manifest.webmanifest', 'sw.js'];

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const commit = currentCommit();

// GIT_COMMIT is set by builds without git history, such as the Docker image
function currentCommit() {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT);
for (const f of FILES) await cp(f, `${OUT}/${f}`, { recursive: true });

// Lets anyone check which version a server is running: GET /version.json
const info = { version, commit, builtAt: new Date().toISOString() };
await writeFile(`${OUT}/version.json`, JSON.stringify(info, null, 2) + '\n');

// The service worker caches every file of this build up front, under a
// cache named after the build, so the game works offline after one visit
const files = (await readdir(OUT, { recursive: true, withFileTypes: true }))
  .filter((d) => d.isFile())
  .map((d) => `${d.parentPath.slice(OUT.length + 1)}/${d.name}`.replace(/^\//, ''))
  .filter((f) => f !== 'sw.js' && f !== 'version.json')
  .sort();
const sw = (await readFile(`${OUT}/sw.js`, 'utf8'))
  .replace("const VERSION = 'dev';", `const VERSION = '${version}-${commit}';`)
  .replace("const PRECACHE = ['./'];", `const PRECACHE = ${JSON.stringify(['./', ...files])};`);
if (!sw.includes(commit)) throw new Error('sw.js placeholders not found');
await writeFile(`${OUT}/sw.js`, sw);

console.log(`Built v${version} (${commit}) into ${OUT}/`);
