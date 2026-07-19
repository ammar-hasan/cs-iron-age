// Mount integration tests: driving, mounting, trample, mount death, melee vs beast.

import assert from 'node:assert/strict';
import { Unit } from '../src/entities.js';
import { Mount, tryMount, dismount } from '../src/mounts.js';
import { MOUNTS, MAX_HP, WEAPONS } from '../src/logic.js';

const scene = { add() {}, remove() {} };
const dt = 1 / 60;

let passed = 0;
function t(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function quietCtx(extra = {}) {
  return {
    units: [], mounts: [], colliders: [], frozen: false,
    fx: {
      play() {}, onStrike() {}, onKick() {}, onTrample() {},
      onMountHit() {}, onProjectileHit() {}, onProjectileBlock() {}, onFlyBy() {},
    },
    ...extra,
  };
}

t('drive: accelerates forward, turning is rate-limited', () => {
  const h = new Mount(scene, 'horse', 'A', { x: 0, z: 0, face: 0 });
  // face +Z, wish +Z: speed builds toward max
  for (let i = 0; i < 120; i++) h.drive(dt, 0, 1, []);
  assert.ok(h.speed > MOUNTS.horse.speed * 0.85, `speed builds (${h.speed.toFixed(1)})`);
  // wish 90° off: heading cannot snap instantly
  const before = h.face;
  h.drive(dt, 1, 0, []);
  assert.ok(Math.abs(h.face - before) <= MOUNTS.horse.turn * dt + 1e-9, 'turn rate capped');
  // no wish: brakes to a stop
  for (let i = 0; i < 120; i++) h.drive(dt, 0, 0, []);
  assert.ok(h.speed < 0.2, 'horse stops');
});

t('tryMount/dismount: rider sits in the saddle, dismount steps aside', () => {
  const h = new Mount(scene, 'horse', 'A', { x: 5, z: 5, face: 0 });
  const u = new Unit(scene, { name: 'rider', team: 'A', loadoutId: 'reaver' });
  u.reset({ x: 4, z: 4, face: 0 });
  assert.equal(tryMount(u, h), true);
  assert.equal(h.rider, u);
  assert.equal(h.team, 'A');
  assert.ok(u.pos.y > 1, 'rider elevated');
  assert.ok(u.eyeHeight < 1.62, 'mounted eye height lowered');

  const ctx = quietCtx({ units: [u] });
  h.update(dt, ctx);
  assert.ok(Math.abs(u.pos.x - h.pos.x) < 1e-9 && Math.abs(u.pos.z - h.pos.z) < 1e-9, 'rider follows saddle');

  assert.equal(dismount(u), true);
  assert.equal(u.mount, null);
  assert.equal(h.rider, null);
  assert.equal(u.pos.y, 0);
  const side = Math.hypot(u.pos.x - h.pos.x, u.pos.z - h.pos.z);
  assert.ok(side > h.radius, 'dismounted beside the beast');
});

t('trample: full-speed horse damages and respects per-target cooldown', () => {
  const h = new Mount(scene, 'horse', 'A', { x: 0, z: 0, face: 0 });
  const rider = new Unit(scene, { name: 'rider', team: 'A', loadoutId: 'reaver' });
  rider.reset({ x: 0, z: 0, face: 0 });
  const dummy = new Unit(scene, { name: 'dummy', team: 'B', loadoutId: 'legionary' });
  dummy.reset({ x: 0, z: 10, face: Math.PI });

  let tramples = 0;
  const ctx = quietCtx({
    units: [rider, dummy],
    fx: {
      play() {}, onStrike() {}, onKick() {}, onMountHit() {},
      onProjectileHit() {}, onProjectileBlock() {}, onFlyBy() {},
      onTrample() { tramples += 1; },
    },
  });
  tryMount(rider, h);
  // gallop through the dummy
  for (let i = 0; i < 90; i++) h.drive(dt, 0, 1, []);
  for (let i = 0; i < 240; i++) {
    h.drive(dt, 0, 1, []);
    h.update(dt, ctx);
    dummy.update(dt, ctx);
  }
  assert.ok(tramples >= 1, 'trample landed');
  assert.ok(dummy.hp < MAX_HP, 'dummy was hurt');
  assert.ok(dummy.stagger >= 0, 'stagger applied or recovered');
  // cooldown: cannot have hit him 10 times
  assert.ok(tramples <= 3, `trample cooldown holds (${tramples})`);
});

t('mount death throws the rider with a stagger', () => {
  const h = new Mount(scene, 'camel', 'B', { x: 0, z: 0, face: 0 });
  const u = new Unit(scene, { name: 'rider', team: 'B', loadoutId: 'legionary' });
  u.reset({ x: 0, z: 0, face: 0 });
  tryMount(u, h);
  const died = h.applyDamage(9999);
  assert.equal(died, true);
  assert.equal(h.alive, false);
  assert.equal(u.mount, null, 'rider dismounted by death');
  assert.ok(u.stagger > 0.5, 'rider staggered on the fall');
  assert.equal(u.pos.y, 0, 'rider back on the ground');
});

t('melee strikes can target an enemy mount', () => {
  const h = new Mount(scene, 'elephant', 'B', { x: 0, z: 2, face: Math.PI });
  const rider = new Unit(scene, { name: 'mahout', team: 'B', loadoutId: 'reaver' });
  rider.reset({ x: 0, z: 2, face: Math.PI });
  tryMount(rider, h);

  const attacker = new Unit(scene, { name: 'spearman', team: 'A', loadoutId: 'spearman' });
  attacker.reset({ x: 0, z: 0, face: 0 });

  let mountHits = 0;
  const ctx = quietCtx({
    units: [attacker, rider],
    mounts: [h],
    fx: {
      play() {}, onStrike() {}, onKick() {}, onTrample() {},
      onProjectileHit() {}, onProjectileBlock() {}, onFlyBy() {},
      onMountHit() { mountHits += 1; },
    },
  });

  attacker.startAttack('thrust');
  for (let i = 0; i < 60; i++) attacker.update(dt, ctx);
  assert.ok(mountHits >= 1, 'spear thrust reached the elephant');
  assert.ok(h.hp < MOUNTS.elephant.hp, 'elephant took the hit');
});

console.log(`\n${passed} mount tests passed`);
