// Mounts: horses, camels, war elephants. Momentum steering, trample, mortality.

import * as THREE from 'three';
import { MOUNTS, TRAMPLE_CD, angDiff, clamp, lerp } from './logic.js';
import { ARENA } from './world.js';

// ---------------------------------------------------------------------------
// Meshes (procedural, readable silhouettes)
// ---------------------------------------------------------------------------

function makeMountMesh(kind) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const legs = [];
  const extras = {};

  const hide = new THREE.MeshStandardMaterial({
    color: kind === 'horse' ? 0x6b4a2c : kind === 'camel' ? 0xb09268 : 0x7a7d82,
    roughness: 0.9,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3d2c1a, roughness: 0.95 });
  const ivory = new THREE.MeshStandardMaterial({ color: 0xe0d6bd, roughness: 0.6 });
  const tack = new THREE.MeshStandardMaterial({ color: 0x8a2f23, roughness: 0.8 });

  const box = (mat, w, h, d, x, y, z, parent = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const leg = (x, z, len, thick, hipY) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, hipY, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, len, thick), hide);
    m.position.y = -len / 2;
    m.castShadow = true;
    pivot.add(m);
    body.add(pivot);
    legs.push(pivot);
  };

  if (kind === 'horse') {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.25, 3, 8), hide);
    torso.rotation.x = Math.PI / 2;
    torso.position.y = 1.15;
    torso.castShadow = true;
    body.add(torso);
    box(hide, 0.26, 0.55, 0.3, 0, 1.55, 0.75).rotation.x = -0.5;      // neck
    box(hide, 0.22, 0.28, 0.55, 0, 1.85, 1.05);                      // head
    box(dark, 0.08, 0.4, 0.5, 0, 1.78, 0.72);                        // mane
    leg(-0.25, 0.55, 0.85, 0.13, 1.0); leg(0.25, 0.55, 0.85, 0.13, 1.0);
    leg(-0.25, -0.6, 0.85, 0.13, 1.0); leg(0.25, -0.6, 0.85, 0.13, 1.0);
    extras.tail = box(dark, 0.09, 0.6, 0.09, 0, 1.15, -1.05);
    box(tack, 0.5, 0.14, 0.6, 0, 1.52, -0.05);                       // saddle
  } else if (kind === 'camel') {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.35, 3, 8), hide);
    torso.rotation.x = Math.PI / 2;
    torso.position.y = 1.5;
    torso.castShadow = true;
    body.add(torso);
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), hide);
    hump.scale.set(0.9, 1.1, 1.2);
    hump.position.y = 1.95;
    hump.castShadow = true;
    body.add(hump);
    box(hide, 0.22, 0.9, 0.26, 0, 2.0, 0.85).rotation.x = -0.25;     // neck
    box(hide, 0.2, 0.24, 0.5, 0, 2.5, 1.05);                         // head
    leg(-0.28, 0.6, 1.2, 0.14, 1.35); leg(0.28, 0.6, 1.2, 0.14, 1.35);
    leg(-0.28, -0.65, 1.2, 0.14, 1.35); leg(0.28, -0.65, 1.2, 0.14, 1.35);
    box(tack, 0.55, 0.14, 0.65, 0, 2.02, -0.35);                     // saddle
  } else {
    // war elephant
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.95, 1.7, 4, 10), hide);
    torso.rotation.x = Math.PI / 2;
    torso.position.y = 1.7;
    torso.castShadow = true;
    body.add(torso);
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), hide);
    headM.position.set(0, 2.3, 1.35);
    headM.castShadow = true;
    body.add(headM);
    extras.earL = box(hide, 0.08, 0.7, 0.55, -0.62, 2.35, 1.2);
    extras.earR = box(hide, 0.08, 0.7, 0.55, 0.62, 2.35, 1.2);
    // trunk: stacked tapering segments
    const trunk = new THREE.Group();
    trunk.position.set(0, 2.05, 1.8);
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.14 - i * 0.03, 0.17 - i * 0.03, 0.5, 6), hide);
      seg.position.set(0, -0.3 - i * 0.42, 0.08 + i * 0.1);
      seg.castShadow = true;
      trunk.add(seg);
    }
    body.add(trunk);
    extras.trunk = trunk;
    // tusks
    for (const s of [-1, 1]) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 6), ivory);
      tusk.position.set(s * 0.32, 1.8, 1.75);
      tusk.rotation.x = Math.PI / 2.6;
      tusk.castShadow = true;
      body.add(tusk);
    }
    leg(-0.55, 0.7, 1.3, 0.3, 1.35); leg(0.55, 0.7, 1.3, 0.3, 1.35);
    leg(-0.55, -0.8, 1.3, 0.3, 1.35); leg(0.55, -0.8, 1.3, 0.3, 1.35);
    // howdah (riding platform)
    box(tack, 1.0, 0.5, 1.0, 0, 2.85, -0.2);
    box(dark, 0.9, 0.1, 0.9, 0, 2.62, -0.2);
  }

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, body, legs, extras };
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export class Mount {
  constructor(scene, kind, homeTeam, spot) {
    this.kind = kind;
    this.spec = MOUNTS[kind];
    this.homeTeam = homeTeam;
    this.spot = spot;
    this.pos = new THREE.Vector3(spot.x, 0, spot.z);
    this.vel = new THREE.Vector3();
    this.face = spot.face;
    this.radius = this.spec.radius;
    this.hp = this.spec.hp;
    this.alive = true;
    this.speed = 0;
    this.rider = null;
    this.team = null;          // set while ridden
    this.time = 0;
    this.deadT = 0;
    this.legPhase = Math.random() * 6;
    this.flash = 0;
    this.trampleCd = new Map();

    const m = makeMountMesh(kind);
    this.mesh = m.group;
    this.refs = m;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.face;
    scene.add(this.mesh);
  }

  reset() {
    this.pos.set(this.spot.x, 0, this.spot.z);
    this.vel.set(0, 0, 0);
    this.face = this.spot.face;
    this.hp = this.spec.hp;
    this.alive = true;
    this.speed = 0;
    this.rider = null;
    this.team = null;
    this.deadT = 0;
    this.flash = 0;
    this.trampleCd.clear();
    this.mesh.visible = true;
    this.mesh.rotation.set(0, this.face, 0);
    this.refs.body.rotation.set(0, 0, 0);
    this.mesh.position.copy(this.pos);
  }

  // Rider input: wish direction (world XZ, normalized-ish).
  drive(dt, wx, wz, colliders) {
    if (!this.alive) return;
    const wish = Math.hypot(wx, wz) > 0.1;
    if (wish) {
      const want = Math.atan2(wx, wz);
      const d = angDiff(want, this.face);
      this.face += clamp(d, -this.spec.turn * dt, this.spec.turn * dt);
      const align = Math.max(0, Math.cos(angDiff(want, this.face)));
      const target = this.spec.speed * align;
      this.speed += clamp(target - this.speed, -this.spec.brake * dt, this.spec.accel * dt);
    } else {
      this.speed += clamp(0 - this.speed, -this.spec.brake * dt, this.spec.accel * dt);
    }

    const f = Math.sin(this.face), c = Math.cos(this.face);
    this.vel.set(f * this.speed, 0, c * this.speed);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // circle vs boxes
    for (const b of colliders) {
      if (b.max.y < 0.35) continue;
      const cx = clamp(this.pos.x, b.min.x, b.max.x);
      const cz = clamp(this.pos.z, b.min.z, b.max.z);
      const dx = this.pos.x - cx, dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < this.radius * this.radius && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        this.pos.x = cx + (dx / d) * this.radius;
        this.pos.z = cz + (dz / d) * this.radius;
        if (this.speed > this.spec.speed * 0.6) this.speed *= 0.5;   // slammed into cover
      }
    }
    const L = ARENA - 0.6;
    this.pos.x = clamp(this.pos.x, -L, L);
    this.pos.z = clamp(this.pos.z, -L, L);
  }

  update(dt, ctx) {
    this.time += dt;

    if (!this.alive) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.55);
      this.refs.body.rotation.z = (Math.PI / 2.2) * (1 - (1 - t) * (1 - t));
      if (this.deadT > 4) this.mesh.position.y = -(this.deadT - 4) * 0.5;
      if (this.deadT > 6) this.mesh.visible = false;
      return;
    }

    if (this.rider) {
      // keep the rider in the saddle
      this.rider.pos.set(this.pos.x, this.pos.y + this.spec.saddle, this.pos.z);
      this.rider.vel.copy(this.vel);

      // trample
      if (this.speed > this.spec.speed * 0.55) {
        const tr = this.spec.trample;
        for (const u of ctx.units) {
          if (!u.alive || u === this.rider || u.team === this.rider.team) continue;
          const dx = u.pos.x - this.pos.x, dz = u.pos.z - this.pos.z;
          if (Math.hypot(dx, dz) > this.radius + u.radius + 0.15) continue;
          if ((this.trampleCd.get(u.id) || 0) > this.time) continue;
          this.trampleCd.set(u.id, this.time + TRAMPLE_CD);
          const { died } = u.applyStrike({
            dmg: tr.dmg, blocked: false, guardBroken: false,
            stagger: tr.stagger, staminaDelta: 0, knock: tr.knock, hit: true,
          }, this.pos);
          ctx.fx.onTrample(this, u, died);
        }
      }
    }

    // mesh sync + gait
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.face;
    const sf = clamp(this.speed / this.spec.speed, 0, 1);
    this.legPhase += dt * (2 + this.speed * 1.4);
    const R = this.refs;
    for (let i = 0; i < R.legs.length; i++) {
      R.legs[i].rotation.x = Math.sin(this.legPhase + (i % 2) * Math.PI + (i > 1 ? 0.6 : 0)) * 0.55 * sf;
    }
    R.body.position.y = Math.abs(Math.sin(this.legPhase)) * 0.05 * sf;
    if (R.extras.tail) R.extras.tail.rotation.x = 0.4 + Math.sin(this.time * 2.3) * 0.25;
    if (R.extras.trunk) R.extras.trunk.rotation.x = Math.sin(this.time * 1.4) * 0.12;
    if (R.extras.earL) {
      R.extras.earL.rotation.z = 0.15 + Math.sin(this.time * 1.9) * 0.12;
      R.extras.earR.rotation.z = -0.15 - Math.sin(this.time * 1.9 + 1) * 0.12;
    }
    if (this.flash > 0) this.flash -= dt;
  }

  applyDamage(dmg) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flash = 0.15;
    if (this.hp > 0) return false;
    this.hp = 0;
    this.die();
    return true;
  }

  die() {
    this.alive = false;
    this.deadT = 0;
    this.speed = 0;
    if (this.rider) {
      const r = this.rider;
      r.mount = null;
      r.eyeHeight = 1.62;
      r.stagger = Math.max(r.stagger, 0.9);
      r.pos.y = 0;
      r.vel.set(0, 0, 0);
      this.rider = null;
      this.team = null;
    }
  }
}

export function tryMount(unit, mount) {
  if (!mount.alive || mount.rider || !unit.alive || unit.mount) return false;
  mount.rider = unit;
  mount.team = unit.team;
  unit.mount = mount;
  unit.eyeHeight = 1.12;
  unit.pos.set(mount.pos.x, mount.pos.y + mount.spec.saddle, mount.pos.z);
  unit.vel.set(0, 0, 0);
  return true;
}

export function dismount(unit) {
  const m = unit.mount;
  if (!m) return false;
  m.rider = null;
  m.team = null;
  unit.mount = null;
  unit.eyeHeight = 1.62;
  const rx = -Math.cos(m.face), rz = Math.sin(m.face);
  unit.pos.set(
    m.pos.x + rx * (m.radius + 0.7),
    0,
    m.pos.z + rz * (m.radius + 0.7),
  );
  unit.vel.set(0, 0, 0);
  return true;
}

// Two pens (from world.penPosts): horse + camel + elephant per team.
export function makeMounts(scene, world) {
  const mounts = [];
  world.penPosts.forEach((pen, i) => {
    const team = pen.z < 0 ? 'A' : 'B';
    const toMid = pen.z < 0 ? 1 : -1;
    mounts.push(new Mount(scene, 'horse', team, { x: pen.x - 2.2, z: pen.z, face: toMid > 0 ? 0 : Math.PI }));
    mounts.push(new Mount(scene, 'camel', team, { x: pen.x + 2.2, z: pen.z, face: toMid > 0 ? 0 : Math.PI }));
    mounts.push(new Mount(scene, 'elephant', team, { x: pen.x, z: pen.z + 4 * toMid, face: toMid > 0 ? 0 : Math.PI }));
  });
  return mounts;
}
