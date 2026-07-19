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
- Blender integration: `.kimi-code/mcp.json` registers the `blender` MCP server
  (official Blender Lab server via
  `uvx --from git+https://projects.blender.org/lab/blender_mcp.git#subdirectory=mcp blender-mcp`,
  bridges to the official Blender addon socket on localhost:9876; do NOT use the
  PyPI `blender-mcp` package — that's the incompatible community fork).
  Tools appear as `mcp__blender__*` in new sessions; Blender must be running
  with the official MCP addon (Blender Lab repository) enabled.
- `GOAL.md` holds the approved Blender re-asset goal (launch it in a session
  that has the MCP tools). Its proof command is `node tools/validate-assets.mjs`,
  which checks `assets/manifest.json` — update the manifest, not the script,
  when the asset queue changes.
