// GLB asset pipeline: preloads Blender-authored models (see GOAL.md) and hands
// out clones. When a GLB is missing or fails to parse the cache holds null and
// callers keep their procedural builder as a fallback path — those fallbacks
// are removed once every replacement is wired in and verified.
//
// Paths are listed literally so tools/validate-assets.mjs can confirm each
// manifest entry is referenced by game code.

const PATHS = {
  // weapons & shields
  gladius: 'assets/weapons/gladius.glb',
  spear: 'assets/weapons/spear.glb',
  falx: 'assets/weapons/falx.glb',
  dagger: 'assets/weapons/dagger.glb',
  bow: 'assets/weapons/bow.glb',
  javelin: 'assets/weapons/javelin.glb',
  shield_scutum: 'assets/weapons/shield_scutum.glb',
  shield_round: 'assets/weapons/shield_round.glb',
  // characters
  warrior: 'assets/characters/warrior.glb',
  // mounts
  horse: 'assets/mounts/horse.glb',
  camel: 'assets/mounts/camel.glb',
  elephant: 'assets/mounts/elephant.glb',
  // environment (Hunza / Gilgit mountain-fort set)
  fort_wall: 'assets/environment/fort_wall.glb',
  watchtower: 'assets/environment/watchtower.glb',
  stone_house: 'assets/environment/stone_house.glb',
  bazaar_stall: 'assets/environment/bazaar_stall.glb',
  gate: 'assets/environment/gate.glb',
  well: 'assets/environment/well.glb',
  banner_standard: 'assets/environment/banner_standard.glb',
  rocks: 'assets/environment/rocks.glb',
  juniper: 'assets/environment/juniper.glb',
  pine: 'assets/environment/pine.glb',
  peaks_backdrop: 'assets/environment/peaks_backdrop.glb',
};

const cache = new Map();   // key -> gltf.scene template, or null when unavailable

// Preload every registered GLB. Call once at boot, before building the world.
export async function loadAssets() {
  const { GLTFLoader } = await import('../vendor/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(PATHS).map(async ([key, url]) => {
    try {
      const gltf = await loader.loadAsync(`./${url}`);
      gltf.scene.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      cache.set(key, gltf.scene);
    } catch {
      cache.set(key, null);   // no GLB yet — procedural fallback stays in use
    }
  }));
  return cache;
}

// A deep clone of the cached GLB scene, or null when the asset never loaded
// (tests, or a missing file). Meshes share materials with the template —
// clone materials yourself before tinting per-instance.
export function assetClone(key) {
  const tpl = cache.get(key);
  return tpl ? tpl.clone(true) : null;
}
