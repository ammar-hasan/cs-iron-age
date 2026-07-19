// Bot brains: seek, space, strike, block, kick turtles, hold lanes.

import * as THREE from 'three';
import { WEAPONS, PROJECTILES, THROW_WINDUP, MOUNT_INTERACT_DIST, losClear, angDiff, forwardVec, clamp } from './logic.js';
import { moveUnit } from './entities.js';
import { tryMount } from './mounts.js';

const THINK = 0.14;   // s between decisions
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();

export class BotBrain {
  constructor(unit, rng = Math.random) {
    this.u = unit;
    this.rng = rng;
    this.thinkT = rng() * THINK;
    this.target = null;
    this.orbitDir = rng() < 0.5 ? -1 : 1;
    this.orbitT = 0;
    this.blockT = 0;
    this.enemyBlockTime = 0;
    this.aggro = 0.75 + rng() * 0.5;      // personality: how eagerly they commit
    this.discipline = 0.4 + rng() * 0.6;  // personality: how readily they block
    this.aimSkill = 0.55 + rng() * 0.45;  // personality: ranged accuracy
    this.anchor = null;                    // strategic anchor (objective point)
    this.homeAnchor = null;
    this.holdPos = null;
    this.useMount = false;                 // cavalry: seeks a mount at round start
    this.mountTarget = null;
  }

  findMount(ctx) {
    let best = null, bd = Infinity;
    for (const m of ctx.mounts || []) {
      if (!m.alive || m.rider) continue;
      const d = this.u.pos.distanceToSquared(m.pos);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // Aim with target lead + gravity compensation + skill-based error.
  aimDir(t, kind, power, out) {
    const u = this.u;
    const spec = PROJECTILES[kind];
    const ex = u.pos.x, ey = u.pos.y + 1.5, ez = u.pos.z;
    const dist = Math.hypot(t.pos.x - ex, t.pos.z - ez);
    const tof = dist / (spec.speed * power);
    const px = t.pos.x + t.vel.x * tof * 0.85;
    const pz = t.pos.z + t.vel.z * tof * 0.85;
    const py = t.pos.y + 1.15 + 0.5 * spec.gravity * tof * tof;
    out.set(px - ex, py - ey, pz - ez).normalize();
    const err = (1 - this.aimSkill) * 0.09;
    out.x += (this.rng() - 0.5) * err;
    out.y += (this.rng() - 0.5) * err * 0.6;
    out.z += (this.rng() - 0.5) * err;
    return out.normalize();
  }

  // Returns true when the bot is committed to ranged play this think.
  decideRanged(t, dist, ctx) {
    const u = this.u;
    const rid = u.rangedId;

    const wantRanged = rid === 'bow'
      ? (dist > 6.5 && dist < 32)
      : (dist > 4.5 && dist < 15);
    if (!wantRanged) return false;

    // need a clear lane to the target's chest
    const clear = losClear(
      u.pos.x, u.pos.y + 1.5, u.pos.z,
      t.pos.x, t.pos.y + 1.2, t.pos.z,
      ctx.colliders,
    );
    if (!clear) return false;

    u.setSlot('ranged');
    if (rid === 'bow') {
      if (!u.draw && !u.busy && u.stagger <= 0) u.startDraw();
      if (u.draw) {
        const need = Math.min(WEAPONS.bow.drawTime, 0.3 + dist * 0.02);
        if (u.draw.t >= need) {
          const power = u.releaseDraw();
          this.aimDir(t, 'arrow', power, _dir);
          _origin.set(u.pos.x, u.pos.y + 1.5, u.pos.z).addScaledVector(_dir, 0.5);
          ctx.spawnProjectile(u, 'arrow', _origin, _dir, power);
          ctx.fx.play('bowLoose');
        }
      }
    } else {
      if (!u.throwSt && !u.busy && u.stagger <= 0) u.startThrow();
      if (u.throwSt && !u.throwSt.released && u.throwSt.t >= THROW_WINDUP) {
        u.throwSt.released = true;
        u.ammo.javelin -= 1;
        this.aimDir(t, 'javelin', 1, _dir);
        _origin.set(u.pos.x, u.pos.y + 1.5, u.pos.z).addScaledVector(_dir, 0.5);
        ctx.spawnProjectile(u, 'javelin', _origin, _dir, 1);
        ctx.fx.play('bowLoose');
        u.throwSt = null;
      }
    }
    return true;
  }

  nearestEnemy(units) {
    let best = null, bd = Infinity;
    for (const o of units) {
      if (!o.alive || o.team === this.u.team) continue;
      const d = this.u.pos.distanceToSquared(o.pos);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  update(dt, ctx) {
    const u = this.u;
    if (!u.alive) return;
    if (ctx.frozen) { u.setBlock(false); return; }

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = THINK;
      this.target = this.nearestEnemy(ctx.units);
      this.orbitT -= THINK;
      if (this.orbitT <= 0) {
        this.orbitT = 1.2 + this.rng() * 1.6;
        if (this.rng() < 0.35) this.orbitDir *= -1;
      }
      this.decide(ctx);
    }

    // cavalry: fetch a mount before joining the melee
    if (this.useMount && !u.mount) {
      const m = this.mountTarget;
      if (!m || !m.alive || m.rider) this.mountTarget = this.findMount(ctx);
      if (this.mountTarget) {
        this.target = null;
        this.anchor = { x: this.mountTarget.pos.x, z: this.mountTarget.pos.z };
        const d = Math.hypot(u.pos.x - this.mountTarget.pos.x, u.pos.z - this.mountTarget.pos.z);
        if (d < MOUNT_INTERACT_DIST && tryMount(u, this.mountTarget)) {
          this.mountTarget = null;
          this.anchor = this.homeAnchor;
        }
      } else {
        this.useMount = false;   // no beasts left: fight on foot
      }
    }

    this.steer(dt, ctx);
  }

  decide(ctx) {
    const u = this.u;
    const t = this.target;
    if (!t) {
      u.setBlock(false);
      if (u.draw) u.draw = null;   // lost the mark: relax the bow
      return;
    }

    const w = WEAPONS[u.loadout.weapon];
    const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z;
    const dist = Math.hypot(dx, dz);
    const toTarget = Math.atan2(dx, dz);
    const facing = Math.abs(angDiff(toTarget, u.face)) < 0.5;

    // --- defensive: enemy mid-swing and close -> raise shield ---
    const enemySwinging = t.attack && t.attack.phase === 'windup';
    if (u.loadout.shield && enemySwinging && dist < w.thrustRange + 0.8 && this.rng() < this.discipline) {
      this.blockT = 0.35 + this.rng() * 0.45;
    }

    // --- ranged play: pick slot, loose when we have a shot ---
    const rid = u.rangedId;
    const hasAmmo = rid && u.ammoFor(rid) > 0;
    if (hasAmmo && this.decideRanged(t, dist, ctx)) return;

    if (u.slot === 'ranged') u.setSlot('melee');

    // --- anti-turtle: enemy turtling -> kick (priority over attacking) ---
    if (t.blocking && dist < 2.0) {
      this.enemyBlockTime += THINK;
      if (this.enemyBlockTime > 0.6 && this.rng() < 0.6 * this.aggro && u.tryKick()) {
        this.enemyBlockTime = 0;
        return;
      }
    } else {
      this.enemyBlockTime = Math.max(0, this.enemyBlockTime - THINK * 2);
    }

    // --- attack decision ---
    const inThrust = dist < w.thrustRange * 0.96;
    const inSlash = dist < w.range * 0.92;
    if (facing && !u.busy && u.stagger <= 0 && !u.blocking) {
      const wantThrust = w.thrustDmg > w.dmg ? inThrust : (inThrust && dist > w.range * 0.8);
      if (wantThrust && this.rng() < 0.85 * this.aggro) {
        u.startAttack('thrust');
      } else if (inSlash && this.rng() < 0.8 * this.aggro) {
        u.startAttack('slash');
      }
    }
  }

  steer(dt, ctx) {
    const u = this.u;
    const t = this.target;
    const w = WEAPONS[u.loadout.weapon];

    // blocking countdown
    if (this.blockT > 0 && u.loadout.shield && !u.busy) {
      this.blockT -= dt;
      u.setBlock(true);
    } else {
      u.setBlock(false);
    }

    let wx = 0, wz = 0;
    if (t) {
      const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const nx = dx / dist, nz = dz / dist;
      // face the target (unless staggered)
      if (u.stagger <= 0) {
        const want = Math.atan2(dx, dz);
        u.face += angDiff(want, u.face) * Math.min(1, dt * 10);
      }

      if (u.mount) {
        // charge the line; ride through rather than stalling on contact
        let mx = nx, mz = nz;
        if (dist < 3.4) {
          mx = Math.sin(u.mount.face);
          mz = Math.cos(u.mount.face);
        }
        u.mount.drive(dt, mx, mz, ctx.colliders);
        return;
      }

      let preferred, retreat;
      if (u.slot === 'ranged') {
        preferred = u.rangedId === 'bow' ? 12 : 8;
        retreat = 1.0;                            // archers kite hard
      } else {
        preferred = u.blocking ? w.range * 0.7 : w.range * 0.62;
        retreat = 0.7;
      }
      if (dist > preferred + 0.35) {
        wx += nx; wz += nz;                       // close in
      } else if (dist < preferred - 0.5 && !u.blocking) {
        wx -= nx * retreat; wz -= nz * retreat;   // give ground
      }
      // orbit for spacing / flanking
      wx += -nz * this.orbitDir * 0.55;
      wz += nx * this.orbitDir * 0.55;
    } else if (this.anchor) {
      const dx = this.anchor.x - u.pos.x, dz = this.anchor.z - u.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2) { wx = dx / dist; wz = dz / dist; }
      u.face += angDiff(Math.atan2(dx, dz), u.face) * Math.min(1, dt * 5);
      if (u.mount) {
        u.mount.drive(dt, wx, wz, ctx.colliders);
        return;
      }
    }

    // obstacle avoidance: probe ahead
    const f = forwardVec(u.face);
    const px = u.pos.x + (wx * 0.5 + f.x * 0.5) * 1.4;
    const pz = u.pos.z + (wz * 0.5 + f.z * 0.5) * 1.4;
    for (const b of ctx.colliders) {
      if (b.max.y < 0.4) continue;
      if (px > b.min.x - 0.5 && px < b.max.x + 0.5 && pz > b.min.z - 0.5 && pz < b.max.z + 0.5) {
        // steer around: push perpendicular to box center
        const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
        const bx = u.pos.x - cx, bz = u.pos.z - cz;
        const bl = Math.hypot(bx, bz) || 1;
        wx += (bx / bl) * 0.9;
        wz += (bz / bl) * 0.9;
        break;
      }
    }

    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    const speed = 4.7 * u.moveMul * (u.stagger > 0 ? 1 : (0.85 + this.aggro * 0.2));
    moveUnit(u, dt, wx, wz, speed, ctx.colliders, ctx.units);
  }
}
