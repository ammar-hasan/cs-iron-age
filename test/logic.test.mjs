import assert from 'node:assert/strict';
import {
  angDiff, inArc, resolveStrike, createMatch, updateMatch, resetMatch,
  WEAPONS, BLOCK_COST, KICK, PROJECTILES, BANNER,
  losClear, projectileHitZone, shieldStopsProjectile,
  createBanner, updateBanner, forceRoundEnd,
} from '../src/logic.js';

let passed = 0;
function t(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const PI = Math.PI;

t('angDiff wraps to (-PI, PI]', () => {
  assert.ok(Math.abs(angDiff(0, 0)) < 1e-9);
  assert.ok(Math.abs(angDiff(0.2, 0.1) - 0.1) < 1e-9);
  assert.ok(Math.abs(angDiff(0.1, 0.2) + 0.1) < 1e-9);
  // wrap: a just above 0, b just below 2PI -> small positive diff
  assert.ok(Math.abs(angDiff(0.05, 2 * PI - 0.05) - 0.1) < 1e-9);
});

t('inArc respects range and facing', () => {
  // A at origin facing +Z (face=0). B straight ahead at z=1.5.
  assert.equal(inArc(0, 0, 0, 0, 1.5, 2, 0.5), true);
  // behind A
  assert.equal(inArc(0, 0, 0, 0, -1.5, 2, 0.5), false);
  // out of range
  assert.equal(inArc(0, 0, 0, 0, 2.5, 2, 0.5), false);
  // off to the side beyond half arc
  assert.equal(inArc(0, 0, 0, 1.4, 0.2, 2, 0.5), false);
});

t('gladius slash hits and damages unblocked target', () => {
  const r = resolveStrike(
    { x: 0, z: 0, face: 0, weapon: 'gladius', kind: 'slash' },
    { x: 0.3, z: 1.8, face: PI, blocking: false, hasShield: true, stamina: 100 },
  );
  assert.equal(r.hit, true);
  assert.equal(r.dmg, WEAPONS.gladius.dmg);
  assert.equal(r.blocked, false);
});

t('miss when out of arc', () => {
  const r = resolveStrike(
    { x: 0, z: 0, face: 0, weapon: 'gladius', kind: 'slash' },
    { x: 0, z: -1.8, face: PI, blocking: false, hasShield: false, stamina: 100 },
  );
  assert.equal(r.hit, false);
  assert.equal(r.dmg, 0);
});

t('raised shield blocks frontal slash, drains stamina', () => {
  const r = resolveStrike(
    { x: 0, z: 0, face: 0, weapon: 'gladius', kind: 'slash' },
    { x: 0, z: 1.8, face: PI, blocking: true, hasShield: true, stamina: 100 },
  );
  assert.equal(r.hit, true);
  assert.equal(r.dmg, 0);
  assert.equal(r.blocked, true);
  assert.equal(r.staminaDelta, -BLOCK_COST);
});

t('shield does not block attacks from behind', () => {
  const r = resolveStrike(
    { x: 0, z: 0, face: 0, weapon: 'gladius', kind: 'slash' },
    { x: 0, z: 1.8, face: 0, blocking: true, hasShield: true, stamina: 100 }, // facing away
  );
  assert.equal(r.blocked, false);
  assert.equal(r.dmg, WEAPONS.gladius.dmg);
});

t('falx leaks damage through block and breaks weak guards', () => {
  const through = resolveStrike(
    { x: 0, z: 0, face: 0, weapon: 'falx', kind: 'slash' },
    { x: 0, z: 2.0, face: PI, blocking: true, hasShield: true, stamina: 100 },
  );
  assert.equal(through.blocked, true);
  assert.ok(through.dmg > 0, 'guard-breaker chips through');

  const shatter = resolveStrike(
    { x: 0, z: 0, face: 0, weapon: 'falx', kind: 'slash' },
    { x: 0, z: 2.0, face: PI, blocking: true, hasShield: true, stamina: 20 },
  );
  assert.equal(shatter.guardBroken, true);
  assert.ok(shatter.stagger >= 1.0);
  assert.ok(shatter.dmg > 0);
});

t('spear thrust out-reaches its slash', () => {
  const def = { x: 0, z: 3.2, face: PI, blocking: false, hasShield: false, stamina: 100 };
  const slash = resolveStrike({ x: 0, z: 0, face: 0, weapon: 'spear', kind: 'slash' }, def);
  const thrust = resolveStrike({ x: 0, z: 0, face: 0, weapon: 'spear', kind: 'thrust' }, def);
  assert.equal(slash.hit, false);
  assert.equal(thrust.hit, true);
  assert.equal(thrust.dmg, WEAPONS.spear.thrustDmg);
});

t('kick constants are sane', () => {
  assert.ok(KICK.range < WEAPONS.gladius.range, 'kick must be shorter than swords');
  assert.ok(KICK.stagger > 0.5, 'kick must open turtles up');
});

t('match: elimination wins round, score accrues, match ends at winScore', () => {
  const m = createMatch({ freezeTime: 0.5, roundTime: 10, endTime: 0.5, winScore: 2 });
  const full = { A: { count: 5, hp: 500 }, B: { count: 5, hp: 500 } };
  const aDead = { A: { count: 0, hp: 0 }, B: { count: 3, hp: 200 } };

  let ev = updateMatch(m, 0.6, full); // burn freeze
  assert.equal(ev[0].type, 'liveStart');

  ev = updateMatch(m, 0.1, aDead);
  assert.equal(ev[0].type, 'roundEnd');
  assert.equal(ev[0].winner, 'B');
  assert.equal(m.score.B, 1);

  ev = updateMatch(m, 0.6, full); // end phase -> next freeze
  assert.equal(ev[0].type, 'freezeStart');
  assert.equal(m.round, 2);

  updateMatch(m, 0.6, full); // freeze -> live
  ev = updateMatch(m, 0.1, aDead); // B wins again -> match
  assert.equal(ev[0].type, 'roundEnd');
  assert.equal(ev[1].type, 'matchEnd');
  assert.equal(ev[1].winner, 'B');
  assert.equal(m.phase, 'matchEnd');

  ev = resetMatch(m);
  assert.equal(m.score.B, 0);
  assert.equal(m.phase, 'freeze');
  assert.equal(ev[0].type, 'freezeStart');
});

t('match: timer decides by numbers, then damage, else draw', () => {
  const m = createMatch({ freezeTime: 0, roundTime: 0.5, winScore: 5 });
  updateMatch(m, 0.01, { A: { count: 5, hp: 500 }, B: { count: 5, hp: 500 } }); // -> live
  const ev = updateMatch(m, 1.0, { A: { count: 4, hp: 300 }, B: { count: 3, hp: 400 } });
  assert.equal(ev[0].reason, 'time-numbers');
  assert.equal(ev[0].winner, 'A');

  const m2 = createMatch({ freezeTime: 0, roundTime: 0.5, winScore: 5 });
  updateMatch(m2, 0.01, { A: { count: 5, hp: 500 }, B: { count: 5, hp: 500 } });
  const ev2 = updateMatch(m2, 1.0, { A: { count: 3, hp: 100 }, B: { count: 3, hp: 250 } });
  assert.equal(ev2[0].reason, 'time-damage');
  assert.equal(ev2[0].winner, 'B');

  const m3 = createMatch({ freezeTime: 0, roundTime: 0.5, winScore: 5 });
  updateMatch(m3, 0.01, { A: { count: 5, hp: 500 }, B: { count: 5, hp: 500 } });
  const ev3 = updateMatch(m3, 1.0, { A: { count: 2, hp: 150 }, B: { count: 2, hp: 150 } });
  assert.equal(ev3[0].reason, 'draw');
  assert.equal(ev3[0].winner, null);
  assert.equal(m3.score.A + m3.score.B, 0);
});

t('losClear blocked by an intervening box, clear otherwise', () => {
  const wall = [{ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 3, z: 1 } }];
  // straight through the wall
  assert.equal(losClear(0, 1.5, -5, 0, 1.5, 5, wall), false);
  // off to the side, no intersection
  assert.equal(losClear(5, 1.5, -5, 5, 1.5, 5, wall), true);
  // over the top
  assert.equal(losClear(0, 5, -5, 0, 5, 5, wall), true);
  // no boxes at all
  assert.equal(losClear(0, 1.5, -5, 0, 1.5, 5, []), true);
});

t('projectileHitZone distinguishes head, body, miss', () => {
  assert.equal(projectileHitZone(0.1, 1.8, 0.05, 0, 0, 0), 'head');
  assert.equal(projectileHitZone(0.2, 1.2, -0.2, 0, 0, 0), 'body');
  assert.equal(projectileHitZone(0.2, 0.5, 0.1, 0, 0, 0), 'body');
  assert.equal(projectileHitZone(1.0, 1.2, 0, 0, 0, 0), null);   // wide
  assert.equal(projectileHitZone(0, 3.0, 0, 0, 0, 0), null);     // over the head
  assert.equal(projectileHitZone(0, 0.02, 0, 0, 0, 0), null);    // at the feet
});

t('shieldStopsProjectile reads frontal vs flanking shots', () => {
  // defender faces +Z (face=0); arrow flying toward -Z comes from the front
  assert.equal(shieldStopsProjectile(0, 0, -10), true);
  // arrow flying toward +Z hits the defender's back
  assert.equal(shieldStopsProjectile(0, 0, 10), false);
  // perpendicular shot: outside the block cone
  assert.equal(shieldStopsProjectile(0, 10, 0.01), false);
});

t('projectile specs support the melee-first balance', () => {
  // an arrow body shot must not one-shot; two body shots shouldn't either
  assert.ok(PROJECTILES.arrow.dmg < 60, 'arrow body shot stays a softening tool');
  assert.ok(PROJECTILES.arrow.dmg * 2 < 100, 'two body shots never kill outright');
  // javelin hits harder but is capped at 3 (data in WEAPONS)
  assert.ok(WEAPONS.javelin.ammo <= 3, 'pila stay scarce');
});

t('banner: lone team fills the meter, cap wins, contest pauses, empty decays', () => {
  const b = createBanner();
  // A alone: meter climbs at rate*1
  updateBanner(b, 1, { A: 1, B: 0 });
  assert.ok(Math.abs(b.meter - BANNER.rate) < 1e-9);
  // three attackers cap the rate bonus
  updateBanner(b, 1, { A: 4, B: 0 });
  assert.ok(Math.abs(b.meter - BANNER.rate * (1 + 3)) < 1e-9, 'extra bodies speed the raise (capped)');
  // contested: holds
  const before = b.meter;
  updateBanner(b, 1, { A: 1, B: 1 });
  assert.equal(b.meter, before);
  // empty: decays toward 0
  updateBanner(b, 1, { A: 0, B: 0 });
  assert.ok(Math.abs(b.meter - (before - BANNER.decay)) < 1e-9);
  // B alone drags it negative
  updateBanner(b, 5, { A: 0, B: 1 });
  assert.ok(b.meter < 0);
  // run B to the cap
  let ev = [];
  for (let i = 0; i < 100 && !ev.length; i++) ev = updateBanner(b, 1, { A: 0, B: 3 });
  assert.equal(ev[0].type, 'bannerCapture');
  assert.equal(ev[0].team, 'B');
});

t('forceRoundEnd: objective win scores like an elimination', () => {
  const m = createMatch({ freezeTime: 0, roundTime: 60, winScore: 2 });
  updateMatch(m, 0.01, { A: { count: 5, hp: 500 }, B: { count: 5, hp: 500 } }); // -> live
  let ev = forceRoundEnd(m, 'A', 'banner');
  assert.equal(ev[0].type, 'roundEnd');
  assert.equal(ev[0].reason, 'banner');
  assert.equal(m.score.A, 1);
  // no double-ending the same round
  ev = forceRoundEnd(m, 'B', 'banner');
  assert.equal(ev.length, 0, 'round already over');
  // play to match end
  updateMatch(m, 10, { A: { count: 5, hp: 500 }, B: { count: 5, hp: 500 } }); // -> next freeze
  updateMatch(m, 10, { A: { count: 5, hp: 500 }, B: { count: 5, hp: 500 } }); // -> live
  ev = forceRoundEnd(m, 'A', 'banner');
  assert.equal(ev[1].type, 'matchEnd');
  assert.equal(ev[1].winner, 'A');
});

console.log(`\n${passed} tests passed`);
