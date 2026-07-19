// Arrows & javelins: ballistic flight, hit zones, shield stops, stuck shafts.

import * as THREE from 'three';
import {
  PROJECTILES, projectileHitZone, shieldStopsProjectile, BOW_BLOCK_STAMINA,
} from './logic.js';

const POOL = 40;
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    const iron = new THREE.MeshStandardMaterial({ color: 0x3f3a33, roughness: 0.5, metalness: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6e4f2f, roughness: 0.85 });
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 5), wood);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({
        mesh, active: false, stuck: 0,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        kind: 'arrow', owner: null, flewBy: false,
      });
    }
    this.woodMat = wood;
    this.ironMat = iron;
    this.idx = 0;
  }

  spawn(owner, kind, origin, dir, power = 1) {
    const spec = PROJECTILES[kind];
    const p = this.pool[this.idx++ % POOL];
    p.active = true;
    p.stuck = 0;
    p.kind = kind;
    p.owner = owner;
    p.flewBy = false;
    p.pos.copy(origin);
    p.vel.copy(dir).normalize().multiplyScalar(spec.speed * power);
    p.mesh.visible = true;
    p.mesh.scale.set(spec.radius / 0.02, spec.len, spec.radius / 0.02);
    p.mesh.material = kind === 'arrow' ? this.woodMat : this.ironMat;
    p.mesh.position.copy(origin);
    this.orient(p);
    return p;
  }

  orient(p) {
    _v.copy(p.vel).normalize();
    p.mesh.quaternion.setFromUnitVectors(_up, _v);
  }

  clear() {
    for (const p of this.pool) { p.active = false; p.mesh.visible = false; }
  }

  update(dt, ctx) {
    for (const p of this.pool) {
      if (!p.active) continue;

      if (p.stuck > 0) {
        p.stuck -= dt;
        if (p.stuck <= 0) { p.active = false; p.mesh.visible = false; }
        continue;
      }

      const spec = PROJECTILES[p.kind];
      p.vel.y -= spec.gravity * dt;
      const ox = p.pos.x, oy = p.pos.y, oz = p.pos.z;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      this.orient(p);

      // ground
      if (p.pos.y <= 0.02) {
        p.pos.y = 0.02;
        p.mesh.position.copy(p.pos);
        p.stuck = 4;
        continue;
      }

      // walls / props
      let hitWorld = false;
      for (const b of ctx.colliders) {
        if (p.pos.x > b.min.x && p.pos.x < b.max.x &&
            p.pos.y > b.min.y && p.pos.y < b.max.y &&
            p.pos.z > b.min.z && p.pos.z < b.max.z) {
          p.pos.set(ox, oy, oz);          // stick at entry point-ish
          p.mesh.position.copy(p.pos);
          p.stuck = 4;
          hitWorld = true;
          break;
        }
      }
      if (hitWorld) continue;

      // units (substeps so fast arrows don't tunnel)
      const steps = Math.max(1, Math.ceil(p.vel.length() * dt / 0.5));
      for (const u of ctx.units) {
        if (!u.alive || u === p.owner || u.team === p.owner.team) continue;
        let zone = null;
        for (let s = 1; s <= steps && !zone; s++) {
          const t = s / steps;
          zone = projectileHitZone(
            ox + (p.pos.x - ox) * t,
            oy + (p.pos.y - oy) * t,
            oz + (p.pos.z - oz) * t,
            u.pos.x, u.pos.z, u.pos.y,
          );
        }
        if (!zone) continue;

        // shield stop
        if (u.blocking && shieldStopsProjectile(u.face, p.vel.x, p.vel.z) && u.stamina > 0) {
          u.stamina = Math.max(0, u.stamina - BOW_BLOCK_STAMINA);
          u.staminaDelay = 0.7;
          ctx.fx.onProjectileBlock(p.owner, u, p.kind, p.pos);
          p.active = false;
          p.mesh.visible = false;
          break;
        }

        const mult = zone === 'head' ? spec.headshotMult : 1;
        const dmg = Math.round(spec.dmg * mult);
        const { died } = u.applyStrike({
          dmg, blocked: false, guardBroken: false,
          stagger: 0.3, staminaDelta: 0, knock: 0.5, hit: true,
        }, p.owner.pos);
        ctx.fx.onProjectileHit(p.owner, u, p.kind, zone, dmg, died);
        p.active = false;
        p.mesh.visible = false;
        break;
      }
      if (!p.active) continue;

      // mounts (big targets; only ridden enemy mounts are fair game)
      if (ctx.mounts) {
        for (const m of ctx.mounts) {
          if (!m.alive || !m.team || m.team === p.owner.team) continue;
          const hd = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
          if (hd > m.radius + spec.radius) continue;
          if (p.pos.y < m.pos.y || p.pos.y > m.pos.y + m.spec.height) continue;
          const died = m.applyDamage(spec.dmg);
          ctx.fx.onMountHit(p.owner, m, spec.dmg, died);
          p.active = false;
          p.mesh.visible = false;
          break;
        }
      }
      if (!p.active) continue;

      // fly-by whistle near the player
      if (!p.flewBy && ctx.listener && p.owner !== ctx.listener) {
        const d2 = p.pos.distanceToSquared(ctx.listener.pos);
        if (d2 < 6.5) {
          p.flewBy = true;
          ctx.fx.onFlyBy(p.owner);
        }
      }

      // safety: out of arena
      if (Math.abs(p.pos.x) > 80 || Math.abs(p.pos.z) > 80 || p.pos.y > 60) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }
}
