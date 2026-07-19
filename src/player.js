// First-person player rig: input, camera, viewmodel (weapon + shield).

import * as THREE from 'three';
import { Unit, weaponMesh, shieldMesh, moveUnit } from './entities.js';
import { tryMount, dismount } from './mounts.js';
import { WEAPONS, LOADOUTS, THROW_WINDUP, MOUNT_INTERACT_DIST, clamp, lerp } from './logic.js';

const _aim = new THREE.Vector3();
const _origin = new THREE.Vector3();

const BASE_SPEED = 5.1;
const SENS = 0.0023;

// viewmodel pose targets: [pos(x,y,z), rot(x,y,z)]
const POSES = {
  idle:    { p: [0.34, -0.38, -0.62], r: [-0.45, -0.3, 0.12] },
  windup:  { p: [0.52, -0.20, -0.52], r: [-1.5, -0.85, 0.9] },
  active:  { p: [-0.30, -0.34, -0.72], r: [-0.25, 0.75, -0.75] },
  twindup: { p: [0.30, -0.34, -0.42], r: [-0.1, 0.05, 0.05] },
  tactive: { p: [0.20, -0.30, -1.08], r: [0.06, 0.0, 0.0] },
  block:   { p: [0.44, -0.52, -0.55], r: [-1.15, -0.4, 0.5] },
};
const SHIELD_POSES = {
  idle:  { p: [-0.46, -0.44, -0.78], r: [0, 0.55, 0] },
  block: { p: [-0.02, -0.30, -0.68], r: [0, 0.02, 0] },
};

export class PlayerRig {
  constructor(scene, camera, loadoutId, name = 'You') {
    this.camera = camera;
    this.unit = new Unit(scene, { name, team: 'A', loadoutId, isPlayer: true });
    this.keys = new Set();
    this.edges = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pitch = 0;
    this.bobPhase = 0;
    this.shake = 0;
    this.kickDip = 0;
    this.locked = false;
    this.view = new THREE.Group();
    camera.add(this.view);
    this.buildViewmodel();
  }

  buildViewmodel() {
    while (this.view.children.length) this.view.remove(this.view.children[0]);
    const lo = this.unit.loadout;
    this.vmWeapon = weaponMesh(lo.weapon);
    this.vmWeapon.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
    this.view.add(this.vmWeapon);
    this.vmShield = null;
    if (lo.shield) {
      this.vmShield = shieldMesh(lo.id === 'spearman');
      this.vmShield.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
      this.vmShield.scale.setScalar(0.85);
      this.view.add(this.vmShield);
    }
    this.vmRanged = null;
    this.vmArrow = null;
    if (lo.ranged) {
      this.vmRanged = weaponMesh(lo.ranged === 'bow' ? 'bow' : 'javelin');
      this.vmRanged.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
      this.vmRanged.visible = false;
      this.view.add(this.vmRanged);
      if (lo.ranged === 'bow') {
        this.vmArrow = weaponMesh('javelin');
        this.vmArrow.scale.setScalar(0.55);
        this.vmArrow.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
        this.vmArrow.visible = false;
        this.view.add(this.vmArrow);
      }
    }
    this.vmThrowHide = 0;
  }

  setLoadout(loadoutId) {
    this.unit.loadoutId = loadoutId;
    this.unit.loadout = LOADOUTS[loadoutId];
    this.unit.refillAmmo();
    this.buildViewmodel();
  }

  bind(dom) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.edges.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.keys.add(`Mouse${e.button}`);
      this.edges.add(`Mouse${e.button}`);
    });
    window.addEventListener('mouseup', (e) => this.keys.delete(`Mouse${e.button}`));
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) this.keys.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  addShake(a) { this.shake = Math.min(0.5, this.shake + a); }

  // Aim direction from current face/pitch (matches camera basis).
  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(cp * Math.sin(this.unit.face), Math.sin(this.pitch), cp * Math.cos(this.unit.face));
  }

  spawnAim(ctx, kind, power) {
    const u = this.unit;
    this.aimDir(_aim);
    u.eyePos(_origin);
    _origin.addScaledVector(_aim, 0.5);
    ctx.spawnProjectile(u, kind, _origin, _aim, power);
    ctx.fx.play('bowLoose');
    this.addShake(0.08);
  }

  looseBow(ctx) {
    const power = this.unit.releaseDraw();
    if (power != null) this.spawnAim(ctx, 'arrow', power);
  }

  update(dt, ctx, frozen) {
    const u = this.unit;

    // --- look ---
    if (this.locked) {
      u.face -= this.mouseDX * SENS;
      this.pitch = clamp(this.pitch - this.mouseDY * SENS, -1.35, 1.35);
    }
    this.mouseDX = 0;
    this.mouseDY = 0;

    // --- move ---
    let wx = 0, wz = 0;
    if (u.alive && !frozen) {
      if (this.keys.has('KeyW')) wz += 1;
      if (this.keys.has('KeyS')) wz -= 1;
      if (this.keys.has('KeyA')) wx -= 1;
      if (this.keys.has('KeyD')) wx += 1;
    }
    const len = Math.hypot(wx, wz) || 1;
    wx /= len; wz /= len;
    // rotate wish dir by facing: forward=(sin face, cos face), right=(-cos face, sin face)
    const s = Math.sin(u.face), c = Math.cos(u.face);
    const dirX = wz * s + wx * -c;
    const dirZ = wz * c + wx * s;

    let speed = BASE_SPEED * u.moveMul;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) speed *= 0.45;

    if (u.mount) {
      // in the saddle: drive the beast, no walking/jumping
      if (u.alive && !frozen) u.mount.drive(dt, dirX, dirZ, ctx.colliders);
      u.pos.set(u.mount.pos.x, u.mount.pos.y + u.mount.spec.saddle, u.mount.pos.z);
      u.vel.copy(u.mount.vel);
    } else {
      moveUnit(u, dt, dirX, dirZ, speed, ctx.colliders, ctx.units);
      if (u.alive && !frozen && this.edges.has('Space') && u.pos.y <= 0.001 && u.stagger <= 0) {
        u.vel.y = 4.6;
      }
    }

    // mount / dismount
    if (u.alive && !frozen && this.edges.has('KeyE')) {
      if (u.mount) {
        dismount(u);
      } else {
        let best = null, bd = MOUNT_INTERACT_DIST * MOUNT_INTERACT_DIST;
        for (const m of ctx.mounts || []) {
          if (!m.alive || m.rider) continue;
          const d2 = u.pos.distanceToSquared(m.pos);
          if (d2 < bd) { bd = d2; best = m; }
        }
        if (best) tryMount(u, best);
      }
    }

    // --- actions ---
    if (u.alive && !frozen) {
      if (this.edges.has('Digit1')) { u.setSlot('melee'); if (this.onSlotChange) this.onSlotChange(); }
      if (this.edges.has('Digit2')) { u.setSlot('ranged'); if (this.onSlotChange) this.onSlotChange(); }

      if (u.slot === 'melee') {
        if (this.edges.has('Mouse0')) u.startAttack('slash');
        if (this.edges.has('KeyV')) u.startAttack('thrust');
        u.setBlock(this.keys.has('Mouse2'));
      } else {
        u.setBlock(false);
        const rid = u.rangedId;
        if (rid === 'bow') {
          if (this.edges.has('Mouse0')) u.startDraw();
          if (u.draw && !this.keys.has('Mouse0')) this.looseBow(ctx);
        } else if (rid === 'javelin') {
          if (this.edges.has('Mouse0')) u.startThrow();
          if (u.throwSt && !u.throwSt.released && u.throwSt.t >= THROW_WINDUP) {
            u.throwSt.released = true;
            u.ammo.javelin -= 1;
            this.spawnAim(ctx, 'javelin', 1);
            u.throwSt = null;
            this.vmThrowHide = 0.45;
          }
        }
      }
      if (this.edges.has('KeyF')) u.tryKick();
    } else if (u.alive) {
      u.setBlock(false);
    }
    this.edges.clear();

    // --- camera ---
    const spd = Math.hypot(u.vel.x, u.vel.z);
    this.bobPhase += dt * (4 + spd * 1.7);
    const bobA = clamp(spd / BASE_SPEED, 0, 1) * 0.035;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const shX = (Math.random() - 0.5) * this.shake * 0.12;
    const shY = (Math.random() - 0.5) * this.shake * 0.12;

    if (u.kick) this.kickDip = Math.min(1, this.kickDip + dt * 10);
    else this.kickDip = Math.max(0, this.kickDip - dt * 6);

    this.camera.position.set(
      u.pos.x + shX,
      u.pos.y + u.eyeHeight + Math.abs(Math.sin(this.bobPhase)) * bobA + shY - this.kickDip * 0.12,
      u.pos.z,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch - this.kickDip * 0.14, u.face + Math.PI, 0);

    this.updateViewmodel(dt, spd);
  }

  updateViewmodel(dt, spd) {
    const u = this.unit;

    // --- ranged slot takes over the viewmodel ---
    const inRanged = u.slot === 'ranged' && this.vmRanged;
    this.vmWeapon.visible = !inRanged;
    if (this.vmShield) this.vmShield.visible = !inRanged;

    // bow draw: slight zoom + charge feedback
    const drawP = u.draw ? Math.min(1, u.draw.t / WEAPONS.bow.drawTime) : 0;
    const targetFov = 75 - drawP * 8;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, targetFov, Math.min(1, dt * 8));
      this.camera.updateProjectionMatrix();
    }
    if (this.hudCharge) this.hudCharge(u.draw ? drawP : null);

    if (inRanged) {
      this.vmThrowHide = Math.max(0, this.vmThrowHide - dt);
      const R = this.vmRanged;
      R.visible = this.vmThrowHide <= 0;
      const k = Math.min(1, dt * 12);
      if (u.rangedId === 'bow') {
        R.position.x = lerp(R.position.x, -0.22, k);
        R.position.y = lerp(R.position.y, -0.34, k);
        R.position.z = lerp(R.position.z, -0.55, k);
        R.rotation.x = lerp(R.rotation.x, drawP * 0.12, k);
        R.rotation.y = lerp(R.rotation.y, 0.22, k);
        if (this.vmArrow) {
          this.vmArrow.visible = !!u.draw;
          if (u.draw) {
            this.vmArrow.position.set(-0.22, -0.27, -0.78 + drawP * 0.34);
            this.vmArrow.rotation.set(Math.PI / 2, 0, 0);
          }
        }
      } else {
        // javelin: cocked back, snaps forward on release
        const t = u.throwSt ? Math.min(1, u.throwSt.t / THROW_WINDUP) : 0;
        const rx = u.throwSt ? lerp(-2.3, -0.7, t) : -1.9;
        R.position.x = lerp(R.position.x, 0.3, k);
        R.position.y = lerp(R.position.y, -0.28, k);
        R.position.z = lerp(R.position.z, -0.55, k);
        R.rotation.x = lerp(R.rotation.x, rx, Math.min(1, dt * 18));
        R.rotation.y = lerp(R.rotation.y, 0.15, k);
      }
      return;
    }
    if (this.vmArrow) this.vmArrow.visible = false;

    // --- melee viewmodel ---
    const a = u.attack;
    let pose = POSES.idle;
    let snap = 14;
    if (u.blocking) pose = POSES.block;
    if (a) {
      const w = WEAPONS[a.weapon];
      if (a.kind === 'slash') {
        if (a.phase === 'windup') { pose = POSES.windup; snap = 22; }
        else if (a.phase === 'active') { pose = POSES.active; snap = 40; }
        else { pose = POSES.idle; snap = 8; }
      } else {
        if (a.phase === 'windup') { pose = POSES.twindup; snap = 18; }
        else if (a.phase === 'active') { pose = POSES.tactive; snap = 46; }
        else { pose = POSES.idle; snap = 9; }
      }
    }
    const k = Math.min(1, dt * snap);
    const wp = this.vmWeapon.position;
    wp.x = lerp(wp.x, pose.p[0], k);
    wp.y = lerp(wp.y, pose.p[1] + Math.sin(this.bobPhase * 0.5) * 0.008 * (spd / BASE_SPEED + 0.3), k);
    wp.z = lerp(wp.z, pose.p[2], k);
    this.vmWeapon.rotation.x = lerp(this.vmWeapon.rotation.x, pose.r[0], k);
    this.vmWeapon.rotation.y = lerp(this.vmWeapon.rotation.y, pose.r[1], k);
    this.vmWeapon.rotation.z = lerp(this.vmWeapon.rotation.z, pose.r[2], k);

    if (this.vmShield) {
      const sp = u.blocking ? SHIELD_POSES.block : SHIELD_POSES.idle;
      const ks = Math.min(1, dt * 12);
      const pp = this.vmShield.position;
      pp.x = lerp(pp.x, sp.p[0], ks);
      pp.y = lerp(pp.y, sp.p[1], ks);
      pp.z = lerp(pp.z, sp.p[2], ks);
      this.vmShield.rotation.x = lerp(this.vmShield.rotation.x, sp.r[0], ks);
      this.vmShield.rotation.y = lerp(this.vmShield.rotation.y, sp.r[1], ks);
      this.vmShield.rotation.z = lerp(this.vmShield.rotation.z, sp.r[2], ks);
    }
  }
}
