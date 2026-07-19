# Project conventions

- Plain ES modules, no build step. Browser loads `src/main.js` via import map
  (`three` → `vendor/three.module.js`, pinned r166).
- `src/logic.js` must stay DOM-free and three-free — it is the node-testable core
  (weapons data, melee resolution, round/match state machine).
- Tests run in node: `node test/logic.test.mjs`, `node test/sim.test.mjs`,
  `node test/mounts.test.mjs`. `three` is a devDependency only so tests can
  import `src/entities.js` headlessly. Run all three after changing combat, AI,
  mounts, modes, or round logic.
- Facing convention everywhere: yaw `face` → forward vector `(sin face, 0, cos face)`.
  Camera uses `rotation.y = face + PI`, order `YXZ`.
- All combat tuning constants live in `src/logic.js` (WEAPONS, KICK, block costs).
- Verify HUD element ids used in `src/hud.js` exist in `index.html` when adding HUD features.
- Serve locally with `python3 -m http.server 8000`.
