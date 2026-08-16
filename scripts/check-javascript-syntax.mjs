import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const roots = ['public/assets', 'netlify/functions', 'scripts', 'tests']
  .map((entry) => path.join(ROOT, entry))
  .filter((entry) => fs.existsSync(entry));

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(?:js|mjs|cjs)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

const files = roots.flatMap(walk).sort();
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`\nSyntax check failed: ${path.relative(ROOT, file)}\n`);
    process.stderr.write(result.stderr || result.stdout || 'Unknown syntax error.\n');
  }
}

if (failed) process.exit(1);
console.log(`Syntax checked ${files.length} JavaScript module(s).`);
