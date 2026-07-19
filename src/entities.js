// Units (player + bots): humanoid meshes, melee state machine, movement.

import * as THREE from 'three';
import {
  WEAPONS, LOADOUTS, MAX_HP, MAX_STAMINA, resolveStrike, KICK,
  STAMINA_REGEN, STAMINA_REGEN_DELAY, forwardVec, inArc, clamp, lerp,
} from './logic.js';
import { ARENA } from './world.js';

export const TEAM_COLOR = { A: 0xa33f2c, B: 0x2e5d75 };
const SKIN = 0xc9a079;
const IRON = 0x5a5f66;
const BRONZE = 0xa87f3f;
const WOOD = 0x6e4f2f;

export const BOT_NAMES = [
  'Brontes', 'Axion', 'Korax', 'Dravo', 'Esun', 'Vedic', 'Marro', 'Talos', 'Ogma', 'Rix',
  'Cassiv', 'Brenn', 'Ambio', 'Segov', 'Dumnor', 'Vlatos', 'Cinget', 'Orgeto',
];

let uid = 0;

// ---------------------------------------------------------------------------
// Mesh builders
// ---------------------------------------------------------------------------

export function weaponMesh(id) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.45, metalness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 });
  const bronze = new THREE.MeshStandardMaterial({ color: BRONZE, roughness: 0.5, metalness: 0.6 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (id === 'gladius') {
    add(new THREE.BoxGeometry(0.045, 0.62, 0.10), iron, 0, 0.45, 0);
    add(new THREE.BoxGeometry(0.16, 0.05, 0.05), bronze, 0, 0.13, 0);
    add(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 6), wood, 0, 0.02, 0);
  } else if (id === 'spear') {
    add(new THREE.CylinderGeometry(0.025, 0.03, 2.3, 6), wood, 0, 0.55, 0);
    add(new THREE.ConeGeometry(0.05, 0.3, 6), iron, 0, 1.85, 0);
    add(new THREE.SphereGeometry(0.045, 6, 5), bronze, 0, -0.62, 0);
  } else if (id === 'falx') {
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.9, 6), wood, 0, 0.1, 0);
    const blade = add(new THREE.BoxGeometry(0.05, 0.85, 0.14), iron, 0, 0.8, 0.1);
    blade.rotation.x = 0.35;
    add(new THREE.BoxGeometry(0.14, 0.05, 0.05), bronze, 0, 0.42, 0);
  } else if (id === 'dagger') {
    add(new THREE.BoxGeometry(0.035, 0.32, 0.07), iron, 0, 0.26, 0);
    add(new THREE.CylinderGeometry(0.02, 0.025, 0.12, 6), wood, 0, 0.02, 0);
  } else if (id === 'bow') {
    // simple curved bow from two angled limbs + string
    add(new THREE.CylinderGeometry(0.02, 0.03, 0.62, 5), wood, 0, 0.28, 0.06, 0.35, 0, 0);
    add(new THREE.CylinderGeometry(0.03, 0.02, 0.62, 5), wood, 0, -0.28, 0.06, -0.35, 0, 0);
    const strGeo = new THREE.CylinderGeometry(0.004, 0.004, 1.05, 3);
    add(strGeo, new THREE.MeshBasicMaterial({ color: 0xd8ccb0 }), 0, 0, -0.12);
  } else if (id === 'javelin') {
    add(new THREE.CylinderGeometry(0.02, 0.025, 1.5, 5), wood, 0, 0.3, 0);
    add(new THREE.ConeGeometry(0.04, 0.22, 5), iron, 0, 1.15, 0);
  }
  return g;
}

export function shieldMesh(round = false) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.8 });
  const bronze = new THREE.MeshStandardMaterial({ color: BRONZE, roughness: 0.5, metalness: 0.6 });
  if (round) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 14), wood);
    m.rotation.x = Math.PI / 2;
    g.add(m);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), bronze);
    g.add(boss);
  } else {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.0, 0.06), wood);
    g.add(m);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bronze);
    boss.position.z = 0.05;
    g.add(boss);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.04, 0.03), bronze);
    rim.position.z = -0.02;
    g.add(rim);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

// Humanoid body facing +Z (matches forward=(sin face, cos face), rotation.y=face).
export function makeHumanoid(team, loadout) {
  const tunic = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.5, metalness: 0.65 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x4a3b28, roughness: 0.95 });

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.30, 0.5, 3, 8), tunic);
  torso.position.y = 1.2;
  body.add(torso);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.12, 8), cloth);
  belt.position.y = 0.95;
  body.add(belt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.78;
  body.add(head);

  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.3, 8), iron);
  helm.position.y = 1.95;
  body.add(helm);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 0.18), cloth);
  legL.position.set(-0.15, 0.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.15;
  body.add(legL, legR);

  // Right arm holds the weapon; pivot at shoulder.
  const armR = new THREE.Group();
  armR.position.set(0.40, 1.52, 0);
  const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.13), skin);
  armRMesh.position.y = -0.22;
  armR.add(armRMesh);
  const wpn = weaponMesh(loadout.weapon);
  wpn.position.set(0, -0.5, 0.1);
  wpn.rotation.x = Math.PI / 2.3;   // blade forward
  armR.add(wpn);
  body.add(armR);

  // Left arm holds the shield (if any).
  const armL = new THREE.Group();
  armL.position.set(-0.40, 1.52, 0);
  const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.13), skin);
  armLMesh.position.y = -0.22;
  armL.add(armLMesh);
  let shield = null;
  if (loadout.shield) {
    shield = shieldMesh(loadout.id === 'spearman');
    shield.position.set(-0.05, -0.45, 0.25);
    armL.add(shield);
  }
  body.add(armL);

  // Ranged weapon slung on back, plus a copy for the hand when drawn.
  let backWeapon = null, handRanged = null;
  if (loadout.ranged) {
    const id = loadout.ranged === 'bow' ? 'bow' : 'javelin';
    backWeapon = weaponMesh(id);
    backWeapon.position.set(0, 1.3, -0.28);
    backWeapon.rotation.z = 0.5;
    body.add(backWeapon);
    handRanged = weaponMesh(id);
    handRanged.position.set(0, -0.5, 0.15);
    handRanged.rotation.x = Math.PI / 2;
    handRanged.visible = false;
    armR.add(handRanged);
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { group, body, torso, head, legL, legR, armR, armL, wpn, shield, tunic, backWeapon, handRanged };
}

// ---------------------------------------------------------------------------
// Unit
// ---------------------------------------------------------------------------

export class Unit {
  constructor(scene, { name, team, loadoutId, isPlayer = false }) {
    this.id = ++uid;
    this.name = name;
    this.team = team;
    this.loadoutId = loadoutId;
    this.loadout = LOADOUTS[loadoutId];
    this.isPlayer = isPlayer;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.face = 0;
    this.radius = 0.42;
    this.eyeHeight = 1.62;

    this.hp = MAX_HP;
    this.stamina = MAX_STAMINA;
    this.staminaDelay = 0;
    this.alive = true;
    this.deadT = 0;

    this.blocking = false;
    this.blockHeld = false;
    this.attack = null;    // { kind:'slash'|'thrust', phase, t, weapon }
    this.kick = null;      // { phase, t }
    this.stagger = 0;
    this.walkPhase = 0;
    this.speedSm = 0;

    this.slot = 'melee';         // 'melee' | 'ranged'
    this.draw = null;            // { t } while drawing the bow
    this.throwSt = null;         // { t, released } while throwing

    this.ammo = {};        // ranged ammo, refilled on reset
    this.refillAmmo();

    this.mount = null;     // set when riding (mounts.js)

    if (!isPlayer) {
      this.refs = makeHumanoid(team, this.loadout);
      this.mesh = this.refs.group;
      scene.add(this.mesh);
    } else {
      this.refs = null;
      this.mesh = null;
    }
  }

  refillAmmo() {
    this.ammo = {};
    if (this.loadout.ranged === 'bow') this.ammo.bow = WEAPONS.bow.ammo;
    if (this.loadout.ranged === 'javelin') this.ammo.javelin = WEAPONS.javelin.ammo;
  }

  reset(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.vel.set(0, 0, 0);
    this.face = spawn.face;
    this.hp = MAX_HP;
    this.stamina = MAX_STAMINA;
    this.staminaDelay = 0;
    this.alive = true;
    this.deadT = 0;
    this.blocking = false;
    this.blockHeld = false;
    this.attack = null;
    this.kick = null;
    this.stagger = 0;
    this.slot = 'melee';
    this.draw = null;
    this.throwSt = null;
    this.mount = null;
    this.eyeHeight = 1.62;
    this.refillAmmo();
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.rotation.set(0, this.face, 0);
      this.mesh.position.copy(this.pos);
      this.refs.body.rotation.set(0, 0, 0);
      this.refs.body.position.set(0, 0, 0);
    }
  }

  eyePos(out) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  get busy() { return !!this.attack || !!this.kick || !!this.throwSt; }
  get moveMul() {
    if (this.stagger > 0) return 0.25;
    if (this.blocking) return 0.42;
    if (this.draw) return 0.5;
    if (this.attack) return 0.55;
    return this.loadout.speed;
  }

  get rangedId() { return this.loadout.ranged || null; }

  setSlot(slot) {
    if (slot === 'ranged' && !this.rangedId) return;
    if (slot === this.slot) return;
    this.slot = slot;
    this.draw = null;
  }

  ammoFor(id) { return this.ammo[id] ?? 0; }

  startDraw() {
    if (!this.alive || this.stagger > 0 || this.busy || this.blocking) return false;
    if (this.slot !== 'ranged' || this.rangedId !== 'bow') return false;
    if (this.ammo.bow <= 0 || this.draw) return false;
    this.draw = { t: 0 };
    return true;
  }

  // Returns draw power 0..1, or null if not drawing.
  releaseDraw() {
    if (!this.draw) return null;
    const power = Math.min(1, 0.35 + (this.draw.t / WEAPONS.bow.drawTime) * 0.65);
    this.draw = null;
    if (this.ammo.bow > 0) this.ammo.bow -= 1;
    return power;
  }

  startThrow() {
    if (!this.alive || this.stagger > 0 || this.busy || this.blocking) return false;
    if (this.slot !== 'ranged' || this.rangedId !== 'javelin') return false;
    if (this.ammo.javelin <= 0) return false;
    this.throwSt = { t: 0, released: false };
    return true;
  }

  startAttack(kind) {
    if (!this.alive || this.stagger > 0 || this.busy || this.blocking) return false;
    this.attack = { kind, phase: 'windup', t: 0, weapon: this.loadout.weapon, resolved: false };
    return true;
  }

  tryKick() {
    if (!this.alive || this.stagger > 0 || this.busy || this.stamina < KICK.cost) return false;
    this.kick = { phase: 'windup', t: 0, resolved: false };
    this.stamina -= KICK.cost;
    this.staminaDelay = STAMINA_REGEN_DELAY;
    return true;
  }

  setBlock(on) {
    this.blockHeld = on && this.loadout.shield;
  }

  applyStrike(res, fromPos) {
    if (!this.alive) return { died: false };
    this.hp -= res.dmg;
    if (res.staminaDelta) {
      this.stamina = Math.max(0, this.stamina + res.staminaDelta);
      this.staminaDelay = STAMINA_REGEN_DELAY;
      if (res.guardBroken) this.blocking = false;
    }
    if (res.stagger > 0) {
      this.stagger = Math.max(this.stagger, res.stagger);
      this.attack = null;
    }
    if (res.knock) {
      const dx = this.pos.x - fromPos.x, dz = this.pos.z - fromPos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / d) * res.knock * 3;
      this.vel.z += (dz / d) * res.knock * 3;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.blocking = false;
      this.attack = null;
      this.kick = null;
      this.stagger = 0;
      if (this.mount) {          // corpse falls out of the saddle
        this.mount.rider = null;
        this.mount.team = null;
        this.mount = null;
        this.eyeHeight = 1.62;
      }
      return { died: true };
    }
    return { died: false };
  }

  // Advance combat timers; resolve hits when swings go active.
  update(dt, ctx) {
    if (!this.alive) {
      this.deadT += dt;
      this.updateMesh(dt);
      return;
    }

    this.stagger = Math.max(0, this.stagger - dt);
    this.staminaDelay = Math.max(0, this.staminaDelay - dt);
    if (this.staminaDelay <= 0 && !this.blocking) {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt);
    }
    this.blocking = this.blockHeld && !this.busy && this.stagger <= 0;

    if (this.attack) {
      const a = this.attack;
      const w = WEAPONS[a.weapon];
      a.t += dt;
      if (a.phase === 'windup' && a.t >= w.windup) {
        a.phase = 'active';
        a.t = 0;
        ctx.fx.play('whoosh');
        this.resolveMelee(ctx);
      } else if (a.phase === 'active' && a.t >= w.active) {
        a.phase = 'recover';
        a.t = 0;
      } else if (a.phase === 'recover' && a.t >= w.recover) {
        this.attack = null;
      }
    }

    if (this.kick) {
      const k = this.kick;
      k.t += dt;
      if (k.phase === 'windup' && k.t >= KICK.windup) {
        k.phase = 'recover';
        k.t = 0;
        this.resolveKick(ctx);
      } else if (k.phase === 'recover' && k.t >= KICK.recover) {
        this.kick = null;
      }
    }

    // ranged timers
    if (this.draw) {
      if (this.stagger > 0) this.draw = null;      // hit while drawing: lose the shot
      else this.draw.t += dt;
    }
    if (this.throwSt) {
      this.throwSt.t += dt;
      if (this.stagger > 0) this.throwSt = null;
    }

    this.updateMesh(dt);
  }

  resolveMelee(ctx) {
    const a = this.attack;
    if (!a || a.resolved) return;
    a.resolved = true;
    const w = WEAPONS[a.weapon];
    const me = { x: this.pos.x, z: this.pos.z, face: this.face, weapon: a.weapon, kind: a.kind };

    let targets = ctx.units.filter((u) => u.alive && u.team !== this.team);
    if (a.kind === 'thrust') {
      // thrust skewers the closest valid target only
      targets.sort((p, q) => this.pos.distanceToSquared(p.pos) - this.pos.distanceToSquared(q.pos));
      targets = targets.slice(0, 1);
    }
    for (const def of targets) {
      const res = resolveStrike(me, {
        x: def.pos.x, z: def.pos.z, face: def.face,
        blocking: def.blocking, hasShield: def.loadout.shield, stamina: def.stamina,
      });
      if (!res.hit) continue;
      const { died } = def.applyStrike(res, this.pos);
      ctx.fx.onStrike(this, def, res, died);
    }

    // enemy mounts are valid targets too (kill the beast, drop the rider)
    if (ctx.mounts) {
      const range = (a.kind === 'thrust' ? w.thrustRange : w.range) + 0.6;
      for (const m of ctx.mounts) {
        if (!m.alive || !m.team || m.team === this.team) continue;
        if (!inArc(this.pos.x, this.pos.z, this.face, m.pos.x, m.pos.z, range + m.radius * 0.6, w.arc)) continue;
        const dmg = a.kind === 'thrust' ? w.thrustDmg : w.dmg;
        const died = m.applyDamage(dmg);
        ctx.fx.onMountHit(this, m, dmg, died);
        if (a.kind === 'thrust') break;
      }
    }
  }

  resolveKick(ctx) {
    const k = this.kick;
    if (!k || k.resolved) return;
    k.resolved = true;
    const f = forwardVec(this.face);
    for (const def of ctx.units) {
      if (!def.alive || def.team === this.team) continue;
      const dx = def.pos.x - this.pos.x, dz = def.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > KICK.range) continue;
      const dot = (dx * f.x + dz * f.z) / (d || 1);
      if (dot < Math.cos(KICK.halfArc)) continue;
      const res = {
        dmg: KICK.dmg, blocked: false, guardBroken: def.blocking,
        stagger: KICK.stagger, staminaDelta: 0, knock: KICK.knock, hit: true,
      };
      const { died } = def.applyStrike(res, this.pos);
      ctx.fx.onKick(this, def, died);
    }
  }

  // ---------------------------------------------------------------------------
  // Visuals
  // ---------------------------------------------------------------------------

  updateMesh(dt) {
    if (!this.mesh) return;
    const R = this.refs;
    this.mesh.position.copy(this.pos);

    if (!this.alive) {
      // keel over, then sink
      const t = Math.min(1, this.deadT / 0.4);
      R.body.rotation.x = -Math.PI / 2 * (1 - (1 - t) * (1 - t));
      R.body.position.y = 0.15 * t;
      if (this.deadT > 3.5) this.mesh.position.y = -(this.deadT - 3.5) * 0.6;
      if (this.deadT > 5.5) this.mesh.visible = false;
      return;
    }
    this.mesh.rotation.y = this.face;

    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.speedSm = lerp(this.speedSm, speed, Math.min(1, dt * 8));
    const sf = clamp(this.speedSm / 5, 0, 1);
    this.walkPhase += dt * (4 + this.speedSm * 1.6);
    const ph = this.walkPhase;

    R.body.position.y = Math.abs(Math.sin(ph)) * 0.07 * sf;
    R.body.rotation.x = sf * 0.08;
    R.legL.rotation.x = Math.sin(ph) * 0.6 * sf;
    R.legR.rotation.x = -Math.sin(ph) * 0.6 * sf;

    // seated in the saddle
    if (this.mount) {
      R.legL.rotation.x = 1.35;
      R.legR.rotation.x = 1.35;
      R.body.position.y = -0.28;
    }

    // stagger wobble
    if (this.stagger > 0) {
      R.body.rotation.z = Math.sin(this.stagger * 25) * 0.12;
      R.body.position.y -= 0.12;
    } else {
      R.body.rotation.z = 0;
    }

    // weapon visibility by active slot
    if (R.handRanged) {
      const ranged = this.slot === 'ranged';
      R.handRanged.visible = ranged;
      R.wpn.visible = !ranged;
      if (R.backWeapon) R.backWeapon.visible = !ranged;
    }

    // right arm: attack animation
    const a = this.attack;
    if (this.draw) {
      // bow drawn: arm raised, pointing the shot
      const pull = Math.min(1, this.draw.t / WEAPONS.bow.drawTime);
      R.armR.rotation.set(lerp(-0.6, -1.55, pull), 0, 0);
      R.armR.position.z = lerp(0, -0.15, pull);
    } else if (this.throwSt) {
      const w = Math.min(1, this.throwSt.t / 0.28);
      R.armR.rotation.set(this.throwSt.released ? lerp(-2.2, -0.3, w) : lerp(-0.3, -2.2, w), 0, 0);
      R.armR.position.z = 0;
    } else if (a) {
      const w = WEAPONS[a.weapon];
      if (a.kind === 'slash') {
        if (a.phase === 'windup') {
          const t = a.t / w.windup;
          R.armR.rotation.set(lerp(-0.3, -2.1, t), lerp(0, -0.9, t), 0);
        } else if (a.phase === 'active') {
          const t = a.t / w.active;
          R.armR.rotation.set(lerp(-2.1, -0.6, t), lerp(-0.9, 1.1, t), 0);
        } else {
          const t = a.t / w.recover;
          R.armR.rotation.set(lerp(-0.6, -0.3, t), lerp(1.1, 0, t), 0);
        }
      } else { // thrust
        if (a.phase === 'windup') {
          const t = a.t / w.windup;
          R.armR.rotation.set(lerp(-0.3, -0.9, t), 0, 0);
          R.armR.position.z = lerp(0, -0.3, t);
        } else if (a.phase === 'active') {
          const t = a.t / w.active;
          R.armR.rotation.set(-1.5, 0, 0);
          R.armR.position.z = lerp(-0.3, 0.75, t);
        } else {
          const t = a.t / w.recover;
          R.armR.rotation.set(lerp(-1.5, -0.3, t), 0, 0);
          R.armR.position.z = lerp(0.75, 0, t);
        }
      }
    } else {
      R.armR.rotation.set(-0.3 + Math.sin(ph) * 0.12 * sf, 0, 0);
      R.armR.position.z = 0;
    }

    // left arm: block pose
    if (this.blocking) {
      R.armL.rotation.set(-1.25, 0.5, 0);
    } else {
      R.armL.rotation.set(-0.25 - Math.sin(ph) * 0.12 * sf, 0, 0);
    }

    // kick: body dip
    if (this.kick) {
      R.body.rotation.x = this.kick.phase === 'windup' ? -0.15 : 0.3;
    }
  }
}

// ---------------------------------------------------------------------------
// Movement: accelerate toward wish dir, gravity, collide with boxes + units.
// ---------------------------------------------------------------------------

const _closest = new THREE.Vector3();

export function moveUnit(u, dt, wishX, wishZ, speed, colliders, units) {
  const accel = 14;
  const tx = wishX * speed, tz = wishZ * speed;
  u.vel.x = lerp(u.vel.x, tx, Math.min(1, accel * dt));
  u.vel.z = lerp(u.vel.z, tz, Math.min(1, accel * dt));
  u.vel.y -= 14 * dt;

  u.pos.x += u.vel.x * dt;
  u.pos.z += u.vel.z * dt;
  u.pos.y += u.vel.y * dt;
  if (u.pos.y <= 0) { u.pos.y = 0; u.vel.y = 0; }

  // circle vs box (XZ), skip boxes the unit stands above
  for (const b of colliders) {
    if (u.pos.y > b.max.y - 0.25) continue;
    _closest.set(
      clamp(u.pos.x, b.min.x, b.max.x),
      0,
      clamp(u.pos.z, b.min.z, b.max.z),
    );
    const dx = u.pos.x - _closest.x, dz = u.pos.z - _closest.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < u.radius * u.radius) {
      if (d2 < 1e-9) {
        // inside the box: push out along smallest penetration axis
        const px = Math.min(u.pos.x - b.min.x, b.max.x - u.pos.x);
        const pz = Math.min(u.pos.z - b.min.z, b.max.z - u.pos.z);
        if (px < pz) u.pos.x = (u.pos.x - b.min.x < b.max.x - u.pos.x) ? b.min.x - u.radius : b.max.x + u.radius;
        else u.pos.z = (u.pos.z - b.min.z < b.max.z - u.pos.z) ? b.min.z - u.radius : b.max.z + u.radius;
      } else {
        const d = Math.sqrt(d2);
        u.pos.x = _closest.x + (dx / d) * u.radius;
        u.pos.z = _closest.z + (dz / d) * u.radius;
      }
    }
  }

  // unit separation
  for (const o of units) {
    if (o === u || !o.alive) continue;
    const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    const min = u.radius + o.radius;
    if (d2 < min * min && d2 > 1e-9) {
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.5;
      u.pos.x += (dx / d) * push;
      u.pos.z += (dz / d) * push;
    }
  }

  // arena bounds
  const L = ARENA - 0.6;
  u.pos.x = clamp(u.pos.x, -L, L);
  u.pos.z = clamp(u.pos.z, -L, L);
}
