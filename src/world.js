// Oasis Crossing — a compact CS-style arena: two gates, three lanes, mid plaza.
// Builds geometry + colliders (Box3 list) and spawn points.

import * as THREE from 'three';

export const ARENA = 30;          // playable half-extent
const WALL_H = 5;

function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b5966a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const shade = 150 + Math.random() * 60;
    g.fillStyle = `rgba(${shade}, ${shade * 0.82 | 0}, ${shade * 0.58 | 0}, 0.25)`;
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
  if (MAT.mud) return MAT;
  MAT.mud = new THREE.MeshStandardMaterial({ color: 0x9c7b52, roughness: 0.95 });
  MAT.mudDark = new THREE.MeshStandardMaterial({ color: 0x7c6040, roughness: 0.95 });
  MAT.wood = new THREE.MeshStandardMaterial({ color: 0x6e4f2f, roughness: 0.85 });
  MAT.woodLight = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.85 });
  MAT.stone = new THREE.MeshStandardMaterial({ color: 0x8f8578, roughness: 0.9 });
  MAT.cloth = new THREE.MeshStandardMaterial({ color: 0xa33f2c, roughness: 0.8, side: THREE.DoubleSide });
  MAT.clothB = new THREE.MeshStandardMaterial({ color: 0x2e5d75, roughness: 0.8, side: THREE.DoubleSide });
  MAT.leaf = new THREE.MeshStandardMaterial({ color: 0x5d7038, roughness: 0.9 });
  MAT.trunk = new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 0.95 });
  MAT.bronze = new THREE.MeshStandardMaterial({ color: 0xa87f3f, roughness: 0.45, metalness: 0.65 });
  MAT.iron = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.5, metalness: 0.7 });
  MAT.fire = new THREE.MeshBasicMaterial({ color: 0xff9a3d });
  return MAT;
}

export function buildWorld(scene) {
  const M = mats();
  const colliders = [];
  const dynamic = [];   // things with per-frame animation (flags, flames)
  const group = new THREE.Group();

  const addBox = (x, y, z, w, h, d, mat, { collide = true, ry = 0, castShadow = true } = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.y = ry;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide && Math.abs(ry) < 0.01) {
      colliders.push(new THREE.Box3(
        new THREE.Vector3(x - w / 2, y, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h, z + d / 2),
      ));
    }
    return mesh;
  };
  const addCyl = (x, y, z, rTop, rBot, h, mat, { collide = true, seg = 10 } = {}) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      const r = Math.max(rTop, rBot);
      colliders.push(new THREE.Box3(
        new THREE.Vector3(x - r, y, z - r),
        new THREE.Vector3(x + r, y + h, z + r),
      ));
    }
    return mesh;
  };

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA * 2 + 40, ARENA * 2 + 40),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // --- perimeter mudbrick walls ---
  const P = ARENA + 1.5;
  addBox(0, 0, -P, ARENA * 2 + 8, WALL_H, 3, M.mud);
  addBox(0, 0, P, ARENA * 2 + 8, WALL_H, 3, M.mud);
  addBox(-P, 0, 0, 3, WALL_H, ARENA * 2 + 8, M.mud);
  addBox(P, 0, 0, 3, WALL_H, ARENA * 2 + 8, M.mud);
  // crenellations (visual)
  for (let i = -ARENA; i <= ARENA; i += 4) {
    addBox(i, WALL_H, -P, 1.6, 0.9, 3.2, M.mudDark, { collide: false, castShadow: false });
    addBox(i, WALL_H, P, 1.6, 0.9, 3.2, M.mudDark, { collide: false, castShadow: false });
    addBox(-P, WALL_H, i, 3.2, 0.9, 1.6, M.mudDark, { collide: false, castShadow: false });
    addBox(P, WALL_H, i, 3.2, 0.9, 1.6, M.mudDark, { collide: false, castShadow: false });
  }

  // --- mid plaza: the well + banner standard ---
  addCyl(0, 0, 0, 1.4, 1.6, 1.0, M.stone);
  addCyl(0, 1.0, 0, 0.12, 0.12, 5.2, M.wood, { collide: false });
  const flagMat = M.cloth.clone();   // own material: tinted by banner mode
  const flagA = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), flagMat);
  flagA.position.set(0.8, 5.4, 0);
  group.add(flagA);
  dynamic.push({ mesh: flagA, kind: 'flag', phase: 0 });
  // capture ring (used by Banner mode)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.4, 5.0, 40),
    new THREE.MeshBasicMaterial({ color: 0xd8c48a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  // --- north/south gate structures (spawn dressing) ---
  for (const s of [-1, 1]) {
    addBox(-4.5, 0, s * (ARENA - 2), 3, 6.5, 2.5, M.mudDark);
    addBox(4.5, 0, s * (ARENA - 2), 3, 6.5, 2.5, M.mudDark);
    addBox(0, 6.5, s * (ARENA - 2), 12, 1.2, 2.8, M.wood, { collide: false });
  }

  // --- lane cover: low walls (crouch-height), crates, pillars ---
  const lowWall = (x, z, w, ry = 0) => addBox(x, 0, z, w, 1.15, 0.9, M.stone, { ry, collide: Math.abs(ry) < 0.01 });
  // mid-lane low walls
  lowWall(-9, -4, 6); lowWall(9, 4, 6);
  lowWall(-9, 8, 5); lowWall(9, -8, 5);
  // flank low walls
  lowWall(-20, -10, 5); lowWall(20, 10, 5);
  lowWall(-20, 6, 5); lowWall(20, -6, 5);

  const crate = (x, z, s = 1.3, ry = 0) =>
    addBox(x, 0, z, s, s, s, Math.random() < 0.5 ? M.wood : M.woodLight, { ry, collide: Math.abs(ry) < 0.01 });
  // crate clusters
  crate(-5, -12); crate(-3.6, -12.2, 1.1); crate(-4.3, -10.9, 0.9); crate(-4.2, -11.8, 1.0);
  crate(5, 12); crate(3.6, 12.2, 1.1); crate(4.3, 10.9, 0.9);
  crate(-16, 14); crate(-14.6, 14.3, 1.0);
  crate(16, -14); crate(14.6, -14.3, 1.0);
  crate(24, 2); crate(24.2, 3.4, 1.0); crate(-24, -2); crate(-24.2, -3.4, 1.0);
  // stacked crates near mid
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

  // --- market tents (flank dressing) ---
  const tent = (x, z, mat) => {
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      addCyl(x + dx, 0, z + dz, 0.09, 0.09, 2.6, M.wood, { collide: false });
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.6, 4), mat);
    roof.position.set(x, 3.2, z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - 1.6, 0, z - 1.6), new THREE.Vector3(x + 1.6, 2.6, z + 1.6),
    ));
  };
  tent(-24, 20, M.cloth); tent(24, -20, M.clothB);

  // --- palms ---
  const palm = (x, z) => {
    addCyl(x, 0, z, 0.25, 0.4, 6, M.trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 4), M.leaf);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.3, 6.4, z + Math.sin(a) * 1.3);
      leaf.rotation.z = Math.cos(a) * 1.15;
      leaf.rotation.x = -Math.sin(a) * 1.15;
      group.add(leaf);
    }
  };
  palm(-26, -26); palm(26, 26); palm(-27, 10); palm(27, -10);

  // --- braziers at spawns (light + flame) ---
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

  // --- scattered rocks ---
  const rockGeo = new THREE.DodecahedronGeometry(0.4, 0);
  for (let i = 0; i < 26; i++) {
    const rock = new THREE.Mesh(rockGeo, M.stone);
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 22;
    rock.position.set(Math.cos(a) * r, 0.15, Math.sin(a) * r);
    rock.scale.setScalar(0.4 + Math.random() * 0.9);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true;
    group.add(rock);
  }

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

  // --- lighting & atmosphere ---
  scene.background = new THREE.Color(0xd9b98a);
  scene.fog = new THREE.Fog(0xd9b98a, 55, 130);
  const hemi = new THREE.HemisphereLight(0xffe6bd, 0x8a6f4d, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
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

  return { group, colliders, spawnsA, spawnsB, dynamic, ring, flag: flagA, penPosts };
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
