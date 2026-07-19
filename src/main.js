// Boot, game loop, teams, match orchestration, effects.

import * as THREE from 'three';
import {
  createMatch, updateMatch, resetMatch, forceRoundEnd,
  createBanner, updateBanner, BANNER, LOADOUTS, WEAPONS,
} from './logic.js';
import { buildWorld, updateWorld } from './world.js';
import { Unit, BOT_NAMES } from './entities.js';
import { BotBrain } from './ai.js';
import { PlayerRig } from './player.js';
import { Projectiles } from './projectiles.js';
import { makeMounts } from './mounts.js';
import * as hud from './hud.js';
import * as sfx from './audio.js';
import { loadAssets } from './assets.js';

const MOUNT_ICON = { horse: '🐎', camel: '🐫', elephant: '🐘' };

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 220);
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Preload Blender GLBs before anything builds meshes (falls back per-asset).
await loadAssets();

const world = buildWorld(scene);
hud.initHud();

// ---------------------------------------------------------------------------
// Hit particles (blood / sparks) — tiny pooled quads
// ---------------------------------------------------------------------------

const POOL = 140;
const burstGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8c1d12 });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
const particles = [];
for (let i = 0; i < POOL; i++) {
  const m = new THREE.Mesh(burstGeo, bloodMat);
  m.visible = false;
  scene.add(m);
  particles.push({ m, vel: new THREE.Vector3(), life: 0 });
}
let pIdx = 0;
function burst(pos, spark, n = 10) {
  for (let i = 0; i < n; i++) {
    const p = particles[pIdx++ % POOL];
    p.m.visible = true;
    p.m.material = spark ? sparkMat : bloodMat;
    p.m.position.set(pos.x, pos.y, pos.z);
    p.vel.set((Math.random() - 0.5) * 4, Math.random() * 3.5 + 1, (Math.random() - 0.5) * 4);
    p.life = 0.45 + Math.random() * 0.2;
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.vel.y -= 12 * dt;
    p.m.position.addScaledVector(p.vel, dt);
    p.m.rotation.x += dt * 9;
    p.m.rotation.z += dt * 7;
  }
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

const ALLY_BOTS = ['legionary', 'spearman', 'reaver', 'skirmisher'];
const ENEMY_BOTS = ['legionary', 'spearman', 'reaver', 'archer', 'spearman'];

const rig = new PlayerRig(scene, camera, 'legionary');
const units = [rig.unit];
const brains = [];

let nameIdx = 0;
function addBot(team, loadoutId) {
  const u = new Unit(scene, { name: BOT_NAMES[nameIdx++ % BOT_NAMES.length], team, loadoutId });
  units.push(u);
  const b = new BotBrain(u);
  b.anchor = { x: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10 };
  brains.push(b);
  return u;
}
for (const lo of ALLY_BOTS) addBot('A', lo);
for (const lo of ENEMY_BOTS) addBot('B', lo);

// cavalry: one rider per warband fetches a mount at round start
for (const b of brains) {
  if (b.u.loadoutId === 'reaver') {
    b.useMount = true;
    b.homeAnchor = { ...b.anchor };
  }
}

const mounts = makeMounts(scene, world);

const projectiles = new Projectiles(scene);

const ctx = {
  units,
  mounts,
  colliders: world.colliders,
  frozen: true,
  fx: null, // set below
  listener: rig.unit,
  spawnProjectile(owner, kind, origin, dir, power) {
    projectiles.spawn(owner, kind, origin, dir, power);
  },
};

// ---------------------------------------------------------------------------
// Combat effects wiring
// ---------------------------------------------------------------------------

const _hitPos = new THREE.Vector3();
ctx.fx = {
  play(name) { (sfx[name] || (() => {}))(); },
  onStrike(att, def, res, died) {
    def.eyePos ? def.eyePos(_hitPos) : _hitPos.copy(def.pos);
    _hitPos.y = def.pos.y + 1.2;
    if (res.blocked) {
      sfx.clang();
      burst(_hitPos, true, 8);
    } else if (res.dmg > 0) {
      sfx.thud();
      burst(_hitPos, false, res.guardBroken ? 16 : 10);
    } else {
      sfx.clang();
    }
    if (att === rig.unit) hud.hitmarker(died);
    if (def === rig.unit) {
      hud.damageFlash();
      rig.addShake(res.guardBroken ? 0.5 : 0.3);
    }
    if (died) {
      sfx.deathCry();
      hud.killfeed(`${hud.feedName(att, rig.unit)} <span class="x">⚔</span> ${hud.feedName(def, rig.unit)}`);
    }
  },
  onKick(att, def, died) {
    sfx.bootThump();
    def.eyePos(_hitPos);
    _hitPos.y = def.pos.y + 1.0;
    burst(_hitPos, false, 6);
    if (att === rig.unit) hud.hitmarker(died);
    if (def === rig.unit) { hud.damageFlash(); rig.addShake(0.55); }
    if (died) {
      sfx.deathCry();
      hud.killfeed(`${hud.feedName(att, rig.unit)} 🦶 ${hud.feedName(def, rig.unit)}`);
    }
  },
  onProjectileHit(att, def, kind, zone, dmg, died) {
    _hitPos.set(def.pos.x, def.pos.y + (zone === 'head' ? 1.75 : 1.2), def.pos.z);
    sfx.thud();
    burst(_hitPos, false, zone === 'head' ? 14 : 9);
    if (att === rig.unit) hud.hitmarker(died);
    if (def === rig.unit) { hud.damageFlash(); rig.addShake(0.35); }
    if (died) {
      sfx.deathCry();
      const icon = (kind === 'arrow' ? '➶' : '➴') + (zone === 'head' ? '✷' : '');
      hud.killfeed(`${hud.feedName(att, rig.unit)} ${icon} ${hud.feedName(def, rig.unit)}`);
    }
  },
  onProjectileBlock(att, def, kind, pos) {
    sfx.clang();
    burst(pos, true, 6);
    if (att === rig.unit) hud.hitmarker(false);
  },
  onFlyBy() {
    sfx.flyBy();
  },
  onTrample(mount, unit, died) {
    sfx.bootThump();
    _hitPos.set(unit.pos.x, unit.pos.y + 1.0, unit.pos.z);
    burst(_hitPos, false, 8);
    if (mount.rider === rig.unit) hud.hitmarker(died);
    if (unit === rig.unit) { hud.damageFlash(); rig.addShake(0.6); }
    if (died) {
      sfx.deathCry();
      hud.killfeed(`${mount.rider ? hud.feedName(mount.rider, rig.unit) : '?'} ${MOUNT_ICON[mount.kind]} ${hud.feedName(unit, rig.unit)}`);
    }
  },
  onMountHit(att, mount, dmg, died) {
    sfx.thud();
    _hitPos.set(mount.pos.x, mount.pos.y + 1.2, mount.pos.z);
    burst(_hitPos, false, 7);
    if (att === rig.unit) hud.hitmarker(died);
    if (mount.rider === rig.unit) { hud.damageFlash(); rig.addShake(0.4); }
    if (died) {
      sfx.deathCry();
      hud.killfeed(`${hud.feedName(att, rig.unit)} ⚔ ${MOUNT_ICON[mount.kind]} ${mount.spec.name}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Match orchestration
// ---------------------------------------------------------------------------

const match = createMatch({ freezeTime: 3, roundTime: 115, endTime: 5, winScore: 5 });
let pendingLoadout = null;
let matchEnded = false;

const MODES = ['annihilation', 'banner'];
const MODE_INFO = {
  annihilation: {
    name: 'ANNIHILATION',
    objective: 'Eliminate the enemy warband. Last team standing takes the round. First to 5 takes the match.',
  },
  banner: {
    name: 'BANNER OF KINGS',
    objective: 'Stand in the mid ring to raise your standard — fill the meter to take the round. Eliminating the enemy works too.',
  },
};
let modeIndex = 0;
let bannerState = null;

const REASONS = {
  elimination: 'warband eliminated',
  'time-numbers': 'time — superior numbers',
  'time-damage': 'time — bloodier blades',
  draw: 'mutual destruction',
  mutual: 'mutual destruction',
  banner: 'raised the war standard',
};

function currentMode() { return MODES[modeIndex]; }

function cycleMode() {
  modeIndex = (modeIndex + 1) % MODES.length;
  applyModeHud();
}

function applyModeHud() {
  const info = MODE_INFO[currentMode()];
  hud.setModeName(info.name);
  hud.setObjective(info.objective);
  hud.setBannerMeter(currentMode() === 'banner' && bannerState ? bannerState.meter / BANNER.cap : currentMode() === 'banner' ? 0 : null);
}

function teamAlive() {
  const out = { A: { count: 0, hp: 0 }, B: { count: 0, hp: 0 } };
  for (const u of units) {
    if (u.alive) { out[u.team].count += 1; out[u.team].hp += u.hp; }
  }
  return out;
}

function resetRound() {
  if (pendingLoadout) {
    rig.setLoadout(pendingLoadout);
    pendingLoadout = null;
    refreshWeaponHud();
  }
  const spawns = { A: world.spawnsA, B: world.spawnsB };
  const idx = { A: 0, B: 0 };
  for (const u of units) {
    const sp = spawns[u.team][idx[u.team]++ % 5];
    u.reset(sp);
  }
  rig.edges.clear();
  rig.mouseDX = 0;
  rig.mouseDY = 0;
  projectiles.clear();
  for (const m of mounts) m.reset();
  for (const b of brains) b.mountTarget = null;
  for (const p of particles) { p.life = 0; p.m.visible = false; }
}

// Per-round setup: reset positions, objective state, bot anchors.
function setupRound(round) {
  resetRound();
  matchEnded = false;
  bannerState = currentMode() === 'banner' ? createBanner() : null;
  let i = 0;
  for (const b of brains) {
    if (b.useMount) continue;
    if (bannerState) {
      // melee bots contest the ring; ranged bots hold off it
      const a = (i++) * 2.4 + (b.u.team === 'A' ? 0 : 0.9);
      const r = b.u.rangedId ? 11 + (i % 3) : 2.5 + (i % 3);
      b.anchor = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    } else {
      b.anchor = { x: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10 };
    }
  }
  hud.setBannerMeter(bannerState ? 0 : null);
  hud.banner(`ROUND ${round}`, MODE_INFO[currentMode()].name, 2.4);
}

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'freezeStart') {
      setupRound(ev.round);
    } else if (ev.type === 'liveStart') {
      sfx.horn();
      hud.banner('FIGHT', '', 1.1);
    } else if (ev.type === 'roundEnd') {
      const mine = ev.winner === 'A';
      const big = ev.winner === null ? 'DRAW' : mine ? 'VICTORY' : 'DEFEAT';
      hud.banner(big, REASONS[ev.reason] || '', 3.4);
      sfx.sting(ev.winner === null ? false : mine);
    } else if (ev.type === 'matchEnd') {
      matchEnded = true;
      const mine = ev.winner === 'A';
      hud.banner(mine ? 'MATCH WON' : 'MATCH LOST', `final score ${ev.score.A} : ${ev.score.B}`, 5.0);
      sfx.sting(mine);
      setTimeout(() => {
        handleEvents(resetMatch(match));
      }, 5200);
    }
  }
}

// ---------------------------------------------------------------------------
// Loadout select UI
// ---------------------------------------------------------------------------

const loadoutEls = {};
{
  const wrap = document.getElementById('loadouts');
  let i = 0;
  for (const lo of Object.values(LOADOUTS)) {
    i += 1;
    const card = document.createElement('div');
    card.className = 'card' + (lo.id === rig.unit.loadoutId ? ' sel' : '');
    card.innerHTML = `<div class="cn">${lo.name}</div><div class="cd">${lo.desc}</div><div class="key">[${i}]</div>`;
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      selectLoadout(lo.id);
    });
    wrap.appendChild(card);
    loadoutEls[lo.id] = card;
  }
}
function selectLoadout(id) {
  for (const [k, el] of Object.entries(loadoutEls)) el.classList.toggle('sel', k === id);
  pendingLoadout = id;
  // if we haven't taken the field yet, apply now so the HUD is honest
  if (match.phase === 'freeze' || matchEnded) {
    rig.setLoadout(id);
    pendingLoadout = null;
    refreshWeaponHud();
  }
}
function refreshWeaponHud() {
  const u = rig.unit;
  if (u.slot === 'ranged' && u.rangedId) {
    const rw = WEAPONS[u.rangedId];
    const ammo = u.ammoFor(u.rangedId);
    hud.setWeapon(rw.name, u.rangedId === 'bow'
      ? `LMB hold to draw, release to loose · arrows ×${ammo} · [1] melee`
      : `LMB to throw · pila ×${ammo} · [1] melee`);
  } else {
    const w = WEAPONS[u.loadout.weapon];
    const rangedHint = u.rangedId ? ' · [2] ranged' : '';
    hud.setWeapon(w.name, (u.loadout.shield
      ? 'LMB slash · V thrust · RMB shield · F kick'
      : 'LMB slash · V thrust · F kick') + rangedHint);
  }
}
refreshWeaponHud();
rig.onSlotChange = refreshWeaponHud;
rig.hudCharge = hud.setCharge;

window.addEventListener('keydown', (e) => {
  const n = parseInt(e.key, 10);
  const ids = Object.keys(LOADOUTS);
  if (!rig.locked && n >= 1 && n <= ids.length) selectLoadout(ids[n - 1]);
  if (!rig.locked && e.code === 'KeyM') cycleMode();
});
document.getElementById('modename').addEventListener('click', (e) => {
  e.stopPropagation();
  cycleMode();
});

// ---------------------------------------------------------------------------
// Pointer lock / start flow
// ---------------------------------------------------------------------------

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  sfx.initAudio();
  sfx.resumeAudio();
  renderer.domElement.requestPointerLock();
});
rig.bind(renderer.domElement);
rig.onLockChange = (locked) => {
  hud.showOverlay(!locked);
};

// ---------------------------------------------------------------------------
// Spectate cam (on death)
// ---------------------------------------------------------------------------

const _specTarget = new THREE.Vector3();
function spectate(dt) {
  const ally = units.find((u) => u.alive && u.team === 'A' && u !== rig.unit);
  if (!ally) return;
  const s = Math.sin(ally.face), c = Math.cos(ally.face);
  _specTarget.set(ally.pos.x - s * 4.2, ally.pos.y + 3.0, ally.pos.z - c * 4.2);
  camera.position.lerp(_specTarget, Math.min(1, dt * 4));
  camera.lookAt(ally.pos.x + s * 2, ally.pos.y + 1.2, ally.pos.z + c * 2);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  ctx.frozen = match.phase !== 'live';

  // match state machine
  handleEvents(updateMatch(match, dt, teamAlive()));

  // banner objective (during live rounds)
  if (bannerState && match.phase === 'live') {
    const inRing = { A: 0, B: 0 };
    for (const u of units) {
      if (u.alive && Math.hypot(u.pos.x, u.pos.z) < BANNER.radius) inRing[u.team] += 1;
    }
    for (const ev of updateBanner(bannerState, dt, inRing)) {
      if (ev.type === 'bannerCapture') {
        handleEvents(forceRoundEnd(match, ev.team, 'banner'));
      }
    }
    const v = bannerState.meter / BANNER.cap;
    hud.setBannerMeter(v);
    // ring + flag tint follow the struggle
    const lead = v === 0 ? null : v > 0 ? 'A' : 'B';
    world.ring.material.color.setHex(lead === 'A' ? 0xc1502e : lead === 'B' ? 0x3d7ea6 : 0xd8c48a);
    world.ring.material.opacity = 0.35 + Math.abs(v) * 0.45;
    world.flag.material.color.setHex(lead === 'A' ? 0xa33f2c : lead === 'B' ? 0x2e5d75 : 0xa33f2c);
  }

  // player
  if (rig.unit.alive) {
    rig.update(dt, ctx, ctx.frozen);
  } else {
    spectate(dt);
  }

  // bots
  for (const b of brains) b.update(dt, ctx);

  // beasts (drive happened in rig/brains; this syncs riders + tramples)
  for (const m of mounts) m.update(dt, ctx);

  // combat timers + mesh anim for everyone
  for (const u of units) u.update(dt, ctx);

  // arrows & pila in flight
  projectiles.update(dt, ctx);

  updateWorld(world, elapsed);
  updateParticles(dt);

  // HUD
  const alive = teamAlive();
  hud.setScore(match.score.A, match.score.B);
  hud.setRound(match.round);
  hud.setTimer(match.t, match.phase);
  hud.setAlive(alive.A.count, alive.B.count);
  hud.setVitals(rig.unit.hp, rig.unit.stamina);
  refreshWeaponHud();

  // mount HUD + interact hint
  if (rig.unit.mount) {
    hud.setMount(rig.unit.mount.spec.name.toUpperCase(), rig.unit.mount.hp / rig.unit.mount.spec.hp);
    hud.setInteract('E — dismount');
  } else {
    hud.setMount(null, null);
    let hint = null;
    if (rig.unit.alive) {
      for (const m of mounts) {
        if (!m.alive || m.rider) continue;
        if (rig.unit.pos.distanceToSquared(m.pos) < 2.8 * 2.8) {
          hint = `E — ride the ${m.spec.name}`;
          break;
        }
      }
    }
    hud.setInteract(hint);
  }
  hud.updateHud(dt);

  renderer.render(scene, camera);
}

setupRound(1);
applyModeHud();
frame();
