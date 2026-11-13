#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'docs/source-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.schemaVersion, 1);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.packageVersion, packageJson.version, 'source manifest package version must match package.json');
assert.equal(manifest.relativeImportClosureFiles, 49);
assert.equal(manifest.additionalSupportFiles, 2);
assert.equal(manifest.manifestEntries, manifest.files.length);
const seen = new Set();
for (const item of manifest.files) {
  assert.equal(typeof item.path, 'string');
  assert.equal(path.isAbsolute(item.path), false);
  assert.equal(item.path.split(/[\\/]/).includes('..'), false);
  assert.equal(seen.has(item.path), false, `duplicate source manifest path: ${item.path}`);
  seen.add(item.path);
  const absolute = path.resolve(root, item.path);
  assert.equal(absolute.startsWith(`${root}${path.sep}`), true, `source path escaped package root: ${item.path}`);
  const bytes = fs.readFileSync(absolute);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, item.sha256, `source hash mismatch: ${item.path}`);
  assert.equal(bytes.length, item.sizeBytes, `source size mismatch: ${item.path}`);
}
console.log(`Workflow Runtime source manifest PASS: ${manifest.files.length} pinned source files`);
