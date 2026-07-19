// Hunza Crossing — a compact CS-style arena re-themed to a Gilgit-Baltistan
// mountain fort: two gates, three lanes, mid plaza. Blender GLBs supply the
// fort set (assets/manifest.json); unqueued dressing (cover, crates, pillars,
// braziers) stays procedural. Colliders and spawns are unchanged from the
// original layout — this is an art swap, not a rebalance.

import * as THREE from 'three';
import { assetClone } from './assets.js';

export const ARENA = 30;          // playable half-extent
const WALL_H = 5;

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7e7c68';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const t = Math.random();
    const shade = 110 + Math.random() * 70;
    g.fillStyle = t < 0.55
      ? `rgba(${shade}, ${shade * 0.98 | 0}, ${shade * 0.82 | 0}, 0.25)`   // grey stone
      : `rgba(${shade * 0.72 | 0}, ${shade * 0.82 | 0}, ${shade * 0.52 | 0}, 0.22)`; // moss
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const MAT = {};
function mats() {
  if (MAT.stone) return MAT;
  MAT.stone = new THREE.MeshStandardMaterial({ color: 0x8f8578, roughness: 0.9 });
  MAT.wood = new THREE.MeshStandardMaterial({ color: 0x6e4f2f, roughness: 0.85 });
  MAT.woodLight = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.85 });
  MAT.bronze = new THREE.MeshStandardMaterial({ color: 0xa87f3f, roughness: 0.45, metalness: 0.65 });
  MAT.fire = new THREE.MeshBasicMaterial({ color: 0xff9a3d });
  return MAT;
}

export function buildWorld(scene) {
  const M = mats();
  const colliders = [];
  const dynamic = [];   // things with per-frame animation (flags, flames)
  const group = new THREE.Group();

  // gameplay-identical collider without any mesh
  const collide = (x, y, z, w, h, d) => {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, y, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h, z + d / 2),
    ));
  };
  // clone a GLB into the world
  const place = (key, x, z, { ry = 0, s = 1, y = 0 } = {}) => {
    const o = assetClone(key);
    if (!o) return null;
    o.position.set(x, y, z);
    o.rotation.y = ry;
    if (s !== 1) o.scale.setScalar(s);
    group.add(o);
    return o;
  };
  // procedural box/cylinder for unqueued dressing (cover, crates, braziers)
  const addBox = (x, y, z, w, h, d, mat, { collide: doCollide = true, ry = 0, castShadow = true } = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.y = ry;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (doCollide && Math.abs(ry) < 0.01) collide(x, y, z, w, h, d);
    return mesh;
  };
  const addCyl = (x, y, z, rTop, rBot, h, mat, { collide: doCollide = true, seg = 10 } = {}) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (doCollide) collide(x, y, z, Math.max(rTop, rBot) * 2, h, Math.max(rTop, rBot) * 2);
    return mesh;
  };

  // --- ground: stony alpine meadow ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2 + 40, ARENA * 2 + 40),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // --- perimeter: fort wall segments + corner watchtowers ---
  const P = ARENA + 1.5;
  for (const [dx, dz, ry] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) {
    for (let i = -2; i <= 3; i++) {
      const t = i * 12 - 6;   // 12m segments centered on the side
      place('fort_wall', dx ? dx * P : t, dz ? dz * P : t, { ry });
    }
    // gameplay collider identical to the old solid walls
    if (dz) collide(0, 0, dz * P, ARENA * 2 + 8, WALL_H, 3);
    else collide(dx * P, 0, 0, 3, WALL_H, ARENA * 2 + 8);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      place('watchtower', sx * P, sz * P, { ry: Math.atan2(-sx, -sz) });
    }
  }

  // --- mid plaza: well + banner standard + capture ring ---
  const well = place('well', 0, 0);
  collide(0, 0, 0, 3.2, 1.0, 3.2);   // same footprint as the old well
  const banner = place('banner_standard', 0, 0);
  let flagMesh = null;
  if (banner) {
    flagMesh = banner.getObjectByName('flag');
    if (flagMesh) {
      flagMesh.material = flagMesh.material.clone();   // tinted per round by banner mode
      flagMesh.material.side = THREE.DoubleSide;
      dynamic.push({ mesh: flagMesh, kind: 'flag', phase: 0 });
    }
  }
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.4, 5.0, 40),
    new THREE.MeshBasicMaterial({ color: 0xd8c48a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  // --- north/south gates (spawn dressing) ---
  for (const s of [-1, 1]) {
    place('gate', 0, s * (ARENA - 2), { ry: s > 0 ? Math.PI : 0 });
    collide(-4.5, 0, s * (ARENA - 2), 3, 6.5, 2.5);
    collide(4.5, 0, s * (ARENA - 2), 3, 6.5, 2.5);
  }

  // --- lane cover: low walls (crouch-height), crates, pillars (unqueued) ---
  const lowWall = (x, z, w, ry = 0) => addBox(x, 0, z, w, 1.15, 0.9, M.stone, { ry, collide: Math.abs(ry) < 0.01 });
  lowWall(-9, -4, 6); lowWall(9, 4, 6);
  lowWall(-9, 8, 5); lowWall(9, -8, 5);
  lowWall(-20, -10, 5); lowWall(20, 10, 5);
  lowWall(-20, 6, 5); lowWall(20, -6, 5);

  const crate = (x, z, s = 1.3, ry = 0) =>
    addBox(x, 0, z, s, s, s, Math.random() < 0.5 ? M.wood : M.woodLight, { ry, collide: Math.abs(ry) < 0.01 });
  crate(-5, -12); crate(-3.6, -12.2, 1.1); crate(-4.3, -10.9, 0.9); crate(-4.2, -11.8, 1.0);
  crate(5, 12); crate(3.6, 12.2, 1.1); crate(4.3, 10.9, 0.9);
  crate(-16, 14); crate(-14.6, 14.3, 1.0);
  crate(16, -14); crate(14.6, -14.3, 1.0);
  crate(24, 2); crate(24.2, 3.4, 1.0); crate(-24, -2); crate(-24.2, -3.4, 1.0);
  addBox(12, 0, -1.5, 1.4, 1.4, 1.4, M.wood);
  addBox(12.1, 1.4, -1.6, 1.1, 1.1, 1.1, M.woodLight, { collide: false });
  addBox(-12, 0, 1.5, 1.4, 1.4, 1.4, M.wood);
  addBox(-12.1, 1.4, 1.6, 1.1, 1.1, 1.1, M.woodLight, { collide: false });

  const pillar = (x, z) => {
    addCyl(x, 0, z, 0.55, 0.7, 5.5, M.stone);
    addBox(x, 5.5, z, 1.7, 0.5, 1.7, M.stone, { collide: false });
  };
  pillar(-7, -18); pillar(7, -18); pillar(-7, 18); pillar(7, 18);
  pillar(-15, 0); pillar(15, 0);

  // --- bazaar stalls (flank cover, same colliders as the old tents) ---
  for (const [x, z, ry] of [[-24, 20, 0.6], [24, -20, -0.9]]) {
    place('bazaar_stall', x, z, { ry });
    collide(x, 0, z, 3.2, 2.6, 3.2);
  }

  // --- mountain junipers + deodar pines (same trunks/colliders as old palms) ---
  place('juniper', -26, -26);
  place('pine', 26, 26);
  place('juniper', -27, 10);
  place('pine', 27, -10);
  for (const [x, z] of [[-26, -26], [26, 26], [-27, 10], [27, -10]]) {
    collide(x, 0, z, 0.8, 6, 0.8);
  }
  // outer treeline (visual only, beyond the walls)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const r = 37 + Math.random() * 9;
    place(Math.random() < 0.5 ? 'juniper' : 'pine',
      Math.cos(a) * r, Math.sin(a) * r,
      { ry: Math.random() * 6.3, s: 1.0 + Math.random() * 0.7 });
  }

  // --- braziers at spawns (light + flame, unqueued) ---
  for (const [x, z] of [[-8, -ARENA + 5], [8, -ARENA + 5], [-8, ARENA - 5], [8, ARENA - 5]]) {
    addCyl(x, 0, z, 0.5, 0.3, 1.1, M.bronze, { collide: false });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), M.fire);
    flame.position.set(x, 1.6, z);
    group.add(flame);
    const light = new THREE.PointLight(0xff8a3d, 6, 12, 1.8);
    light.position.set(x, 2.2, z);
    group.add(light);
    dynamic.push({ mesh: flame, kind: 'flame', phase: Math.random() * 9, light });
  }

  // --- scattered rock outcrops ---
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 18;
    place('rocks', Math.cos(a) * r, Math.sin(a) * r,
      { ry: Math.random() * 6.3, s: 0.5 + Math.random() * 0.5 });
  }

  // --- Karakoram backdrop (far set dressing) ---
  place('peaks_backdrop', 0, -95, { s: 1.5 });
  place('peaks_backdrop', 0, 95, { s: 1.5, ry: Math.PI });
  place('peaks_backdrop', -95, 20, { s: 1.25, ry: Math.PI / 2 });

  // --- beast pens: mounts wait here (populated by mounts.js) ---
  const penPosts = [];
  for (const s of [-1, 1]) {
    const px = 18 * s;
    for (const dz of [-3, 3]) {
      addCyl(px - 3, 0, s * (ARENA - 8) + dz, 0.12, 0.12, 1.4, M.wood, { collide: false });
      addCyl(px + 3, 0, s * (ARENA - 8) + dz, 0.12, 0.12, 1.4, M.wood, { collide: false });
    }
    penPosts.push({ x: px, z: s * (ARENA - 8) });
  }

  scene.add(group);

  // --- lighting & atmosphere: high-mountain morning ---
  scene.background = new THREE.Color(0xb4c6d8);
  scene.fog = new THREE.Fog(0xb4c6d8, 60, 200);
  const hemi = new THREE.HemisphereLight(0xe6eef7, 0x6b7263, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.55);
  sun.position.set(30, 46, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // --- spawns: 5 per team along their gate ---
  const spawnsA = [], spawnsB = [];
  for (let i = 0; i < 5; i++) {
    spawnsA.push({ x: -8 + i * 4, z: -ARENA + 4, face: 0 });       // face +Z (toward mid)
    spawnsB.push({ x: 8 - i * 4, z: ARENA - 4, face: Math.PI });   // face -Z
  }

  return { group, colliders, spawnsA, spawnsB, dynamic, ring, flag: flagMesh, penPosts };
}

// Per-frame world animation (flags, flames).
export function updateWorld(world, t) {
  for (const d of world.dynamic) {
    if (d.kind === 'flag') {
      d.mesh.rotation.y = Math.sin(t * 2.2 + d.phase) * 0.35;
      d.mesh.scale.x = 1 + Math.sin(t * 5 + d.phase) * 0.06;
    } else if (d.kind === 'flame') {
      const s = 0.9 + Math.sin(t * 11 + d.phase) * 0.18 + Math.sin(t * 23 + d.phase * 2) * 0.08;
      d.mesh.scale.set(s, s * (1 + Math.sin(t * 17 + d.phase) * 0.12), s);
      if (d.light) d.light.intensity = 5 + Math.sin(t * 13 + d.phase) * 1.4;
    }
  }
}
