// Headless integration test: run full bot-vs-bot rounds without a browser.
// Exercises entities.js + ai.js + logic.js through the real update paths.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Unit } from '../src/entities.js';
import { BotBrain } from '../src/ai.js';
import { Projectiles } from '../src/projectiles.js';
import { createMatch, updateMatch, forceRoundEnd, createBanner, updateBanner, BANNER, MAX_HP, WEAPONS } from '../src/logic.js';

const scene = { add() {}, remove() {} };
const LOADOUTS = ['legionary', 'spearman', 'reaver'];

const stats = { strikes: 0, blocks: 0, kills: 0, kicks: 0, dmgDealt: 0 };
const ctx = {
  units: [],
  colliders: [],
  frozen: false,
  fx: {
    play() {},
    onStrike(att, def, res, died) {
      stats.strikes += 1;
      if (res.blocked) stats.blocks += 1;
      stats.dmgDealt += res.dmg;
      if (died) stats.kills += 1;
    },
    onKick(att, def, died) { stats.kicks += 1; if (died) stats.kills += 1; },
  },
};

function spawnTeams() {
  ctx.units.length = 0;
  const brains = [];
  for (let i = 0; i < 3; i++) {
    const a = new Unit(scene, { name: `A${i}`, team: 'A', loadoutId: LOADOUTS[i] });
    a.reset({ x: -4 + i * 4, z: -20, face: 0 });
    const b = new Unit(scene, { name: `B${i}`, team: 'B', loadoutId: LOADOUTS[2 - i] });
    b.reset({ x: 4 - i * 4, z: 20, face: Math.PI });
    ctx.units.push(a, b);
    brains.push(new BotBrain(a), new BotBrain(b));
  }
  return brains;
}

function aliveCounts() {
  const out = { A: { count: 0, hp: 0 }, B: { count: 0, hp: 0 } };
  for (const u of ctx.units) if (u.alive) { out[u.team].count += 1; out[u.team].hp += u.hp; }
  return out;
}

// --- simulate until a round ends ---
const match = createMatch({ freezeTime: 0.5, roundTime: 120, endTime: 0.5, winScore: 5 });
const brains = spawnTeams();
const dt = 1 / 60;
let events = [];
let simT = 0;
const maxT = 150;

while (simT < maxT && !events.some((e) => e.type === 'roundEnd')) {
  simT += dt;
  for (const ev of updateMatch(match, dt, aliveCounts())) events.push(ev);
  ctx.frozen = match.phase !== 'live';
  for (const b of brains) b.update(dt, ctx);
  for (const u of ctx.units) u.update(dt, ctx);
}

console.log(`simulated ${simT.toFixed(1)}s:`, JSON.stringify(stats));
console.log('events:', events.map((e) => e.type + (e.winner ? `:${e.winner}` : '')).join(' → '));

assert.ok(events.some((e) => e.type === 'liveStart'), 'round went live');
assert.ok(stats.strikes > 5, `bots actually swung and connected (${stats.strikes})`);
assert.ok(stats.dmgDealt > 100, `real damage happened (${stats.dmgDealt})`);
assert.ok(stats.kills > 0, `someone died (${stats.kills})`);
assert.ok(events.some((e) => e.type === 'roundEnd'), 'round resolved');
const re = events.find((e) => e.type === 'roundEnd');
assert.ok(re.winner === 'A' || re.winner === 'B', `winner decided (${re.winner})`);
assert.ok(match.score.A + match.score.B === 1, 'score moved');

// --- survivors stay inside the arena and above ground ---
for (const u of ctx.units) {
  assert.ok(Math.abs(u.pos.x) <= 30 && Math.abs(u.pos.z) <= 30, `${u.name} in bounds`);
  assert.ok(u.pos.y >= 0, `${u.name} above ground`);
  assert.ok(u.hp >= 0 && u.hp <= MAX_HP, `${u.name} hp sane`);
}

// --- blocks actually occurred in the melee ---
assert.ok(stats.blocks > 0, `shields saw use (${stats.blocks})`);

// --- targeted scenario: a turtle must get kicked ---
// One permanently-blocking legionary; an aggressive reaver should kick it open.
{
  const turtle = new Unit(scene, { name: 'turtle', team: 'A', loadoutId: 'legionary' });
  turtle.reset({ x: 0, z: -1.5, face: 0 });
  const kicker = new Unit(scene, { name: 'kicker', team: 'B', loadoutId: 'legionary' });
  kicker.reset({ x: 0, z: 1.2, face: Math.PI });
  const ctx2 = {
    units: [turtle, kicker], colliders: [], frozen: false,
    fx: { play() {}, onStrike() {}, kicks: 0,
      onKick() { ctx2.fx.kicks += 1; } },
  };
  const brain = new BotBrain(kicker);
  brain.aggro = 1.5;
  let guardBrokenSeen = false;
  for (let i = 0; i < 60 * 8; i++) {
    turtle.blockHeld = true; // turtles forever
    brain.update(dt, ctx2);
    turtle.update(dt, ctx2);
    kicker.update(dt, ctx2);
    if (turtle.stagger > 0.5) guardBrokenSeen = true;
  }
  assert.ok(ctx2.fx.kicks > 0, `turtle got kicked (${ctx2.fx.kicks})`);
  assert.ok(guardBrokenSeen, 'kick staggered the turtle');
}

// --- ranged scenario: an archer must soften/kill a distant target ---
{
  const projectiles = new Projectiles(scene);
  const archer = new Unit(scene, { name: 'archer', team: 'B', loadoutId: 'archer' });
  archer.reset({ x: 0, z: 0, face: 0 });
  const dummy = new Unit(scene, { name: 'dummy', team: 'A', loadoutId: 'legionary' });
  dummy.reset({ x: 0.3, z: 14, face: Math.PI });

  const rStats = { hits: 0, dmg: 0, blocks: 0, kills: 0 };
  const ctx3 = {
    units: [archer, dummy], colliders: [], frozen: false, listener: dummy,
    spawnProjectile(owner, kind, origin, dir, power) {
      projectiles.spawn(owner, kind, origin, dir, power);
    },
    fx: {
      play() {},
      onStrike() {}, onKick() {},
      onProjectileHit(att, def, kind, zone, dmg, died) {
        rStats.hits += 1; rStats.dmg += dmg; if (died) rStats.kills += 1;
      },
      onProjectileBlock() { rStats.blocks += 1; },
      onFlyBy() {},
    },
  };
  const brain = new BotBrain(archer);
  brain.aimSkill = 1.0; // perfect aim for the test

  let arrowsFired = 0;
  const startAmmo = archer.ammo.bow;
  for (let i = 0; i < 60 * 20 && rStats.kills === 0; i++) {
    brain.update(dt, ctx3);
    archer.update(dt, ctx3);
    dummy.update(dt, ctx3);
    projectiles.update(dt, ctx3);
  }
  arrowsFired = startAmmo - archer.ammo.bow;
  console.log(`archer scenario: fired=${arrowsFired} hits=${rStats.hits} dmg=${rStats.dmg} kills=${rStats.kills} blocks=${rStats.blocks}`);

  assert.ok(arrowsFired > 0, 'archer loosed arrows');
  assert.ok(rStats.hits > 0, `arrows connected (${rStats.hits})`);
  assert.ok(rStats.dmg > 0, 'ranged damage happened');
  assert.ok(rStats.kills >= 1 || dummy.hp < MAX_HP, 'archer softened or killed the dummy');
  // melee-first: the kill must have taken several arrows, not one
  assert.ok(arrowsFired >= 2, 'no one-arrow kills from range');
}

// --- shield scenario: frontal arrows are stopped by a raised shield ---
{
  const projectiles = new Projectiles(scene);
  const shooter = new Unit(scene, { name: 'shooter', team: 'B', loadoutId: 'archer' });
  shooter.reset({ x: 0, z: 0, face: 0 });
  const tank = new Unit(scene, { name: 'tank', team: 'A', loadoutId: 'legionary' });
  tank.reset({ x: 0, z: 12, face: Math.PI }); // facing the shooter
  tank.blockHeld = true;

  let blocked = 0, hits = 0;
  const ctx4 = {
    units: [shooter, tank], colliders: [], frozen: false, listener: tank,
    spawnProjectile() {}, fx: { play() {}, onStrike() {}, onKick() {}, onFlyBy() {},
      onProjectileHit() { hits += 1; },
      onProjectileBlock() { blocked += 1; } },
  };
  const dir = new THREE.Vector3(0, 0.02, 1).normalize();
  for (let i = 0; i < 5; i++) {
    const origin = new THREE.Vector3(0, 1.5, 0);
    projectiles.spawn(shooter, 'arrow', origin, dir, 1);
    for (let s = 0; s < 60 * 3; s++) {
      tank.update(dt, ctx4);
      projectiles.update(dt, ctx4);
      tank.blockHeld = true;
    }
  }
  console.log(`shield scenario: blocked=${blocked} hits=${hits} tankHp=${tank.hp}`);
  assert.ok(blocked >= 4, `raised shield stopped frontal arrows (${blocked})`);
  assert.equal(hits, 0, 'no arrow leaked through a fresh shield');
  assert.ok(tank.hp > 90, 'tank barely scratched');
}

// --- banner scenario: uncontested hold wins the round without full elimination ---
{
  const m = createMatch({ freezeTime: 0, roundTime: 60, winScore: 5 });
  const holder = new Unit(scene, { name: 'holder', team: 'A', loadoutId: 'legionary' });
  holder.reset({ x: 0, z: 1, face: 0 });
  const far = new Unit(scene, { name: 'far', team: 'B', loadoutId: 'legionary' });
  far.reset({ x: 25, z: 25, face: Math.PI });
  const units5 = [holder, far];
  const alive = () => ({
    A: { count: units5.filter((u) => u.alive && u.team === 'A').length, hp: 100 },
    B: { count: units5.filter((u) => u.alive && u.team === 'B').length, hp: 100 },
  });
  const banner = createBanner();
  let ended = null;
  updateMatch(m, 0.01, alive()); // -> live
  for (let i = 0; i < 60 * 30 && !ended; i++) {
    const inRing = { A: 0, B: 0 };
    for (const u of units5) {
      if (u.alive && Math.hypot(u.pos.x, u.pos.z) < BANNER.radius) inRing[u.team] += 1;
    }
    for (const ev of updateBanner(banner, dt, inRing)) {
      if (ev.type === 'bannerCapture') {
        const evs = forceRoundEnd(m, ev.team, 'banner');
        if (evs.length) ended = evs[0];
      }
    }
    updateMatch(m, dt, alive());
  }
  assert.ok(ended, 'banner capture ended the round');
  assert.equal(ended.reason, 'banner');
  assert.equal(ended.winner, 'A');
  assert.equal(m.score.A, 1);
  assert.ok(far.alive && holder.alive, 'nobody died — objective, not annihilation');
}

console.log('\nsim integration test passed');
