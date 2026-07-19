// Asset validator — proof command for the Blender re-asset goal (GOAL.md).
// For every entry in assets/manifest.json:
//   1. the GLB file exists
//   2. it parses as glTF 2 binary (magic, version, JSON chunk)
//   3. it contains at least `minMeshes` meshes
//   4. the file path is referenced somewhere under src/ (game actually loads it)
// Also reports each asset's Blender review shot in assets/renders/ when present.
// Exit 0 only if all entries pass. Usage: node tools/validate-assets.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'assets/manifest.json'), 'utf8'));

let failed = 0;
let passed = 0;

function glbJson(path) {
  const buf = readFileSync(path);
  if (buf.length < 20) throw new Error('file too small for GLB');
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('bad magic — not a GLB');
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`unsupported glTF version ${version}`);
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) throw new Error('first chunk is not JSON');
  return JSON.parse(buf.subarray(20, 20 + chunkLen).toString('utf8'));
}

function srcReferences(file) {
  const needle = `assets/${file}`;
  const stack = [join(root, 'src')];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else if (ent.name.endsWith('.js') && readFileSync(p, 'utf8').includes(needle)) return p;
    }
  }
  return null;
}

for (const entry of manifest.assets) {
  const rel = entry.file;
  const abs = join(root, 'assets', rel);
  const min = entry.minMeshes ?? 1;
  try {
    if (!existsSync(abs)) throw new Error('missing');
    const json = glbJson(abs);
    const meshes = (json.meshes || []).length;
    if (meshes < min) throw new Error(`only ${meshes} meshes (need ${min})`);
    const ref = srcReferences(rel);
    if (!ref) throw new Error(`not referenced anywhere under src/ (expected 'assets/${rel}')`);
    const render = join(root, 'assets', 'renders', rel.replace(/\.glb$/, '.png'));
    const shot = existsSync(render) ? ' [render ✓]' : ' [render MISSING]';
    console.log(`ok   ${rel} — ${meshes} mesh(es), referenced in ${ref.split('/').pop()}${shot}`);
    passed += 1;
  } catch (err) {
    console.log(`FAIL ${rel} — ${err.message}`);
    failed += 1;
  }
}

console.log(`\n${passed} ok, ${failed} failing (${manifest.assets.length} total)`);
process.exit(failed ? 1 : 0);
