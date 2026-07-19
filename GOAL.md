# Goal: Realistic Blender assets + Northern-Pakistan re-theme

**Launch instruction (new session with native MCP tools):** read this file and
create a goal with the objective below, verbatim or as close as possible.
Requires the `blender` MCP server (`.kimi-code/mcp.json`) connected and Blender
running with the MCP addon.

---

## Objective

Replace the game's procedural code assets with realistic Blender-authored
assets, and re-theme the arena to the northern mountains of Pakistan
(Gilgit-Baltistan / Hunza).

Drive Blender 5.2 through the `blender` MCP server (`mcp__blender__*` tools).
Export everything as glTF `.glb` into `assets/` and load it via three.js
GLTFLoader, replacing the corresponding procedural builders.

### Asset queue

1. **Weapons & shields** — gladius, dory spear, falx, dagger, recurve bow,
   pilum; scutum + round shield
2. **Characters** — realistic human Iron Age warrior for both teams
   (team-tinted), with loadout variants; if full skeletal rigging proves
   impractical via MCP, fall back to well-modeled static-pose variants per
   animation state and document the choice
3. **Mounts** — courser, dromedary, caparisoned war elephant
4. **Environment** — Hunza/Gilgit mountain-fort set replacing Oasis Crossing:
   stone-and-timber fort walls and watchtower (Baltit/Altit character),
   flat-roofed stone houses, bazaar stalls, gate, well, banner standard, rock
   outcrops, junipers/pines, snow-peak backdrop

### Done when

- `node tools/validate-assets.mjs` exits 0 — every GLB listed in
  `assets/manifest.json` exists, parses as glTF, meets its mesh minimum, and
  is referenced by game code under `src/`.
- All existing test suites pass unchanged: `node test/logic.test.mjs`,
  `node test/sim.test.mjs`, `node test/mounts.test.mjs` (hitboxes, ranges,
  speeds, tuning must not move — this is an art swap, not a rebalance).
- Every asset has a Blender-rendered review shot in `assets/renders/` that
  was visually inspected during the goal: proper proportions, textured
  materials, no gray-box untextured models.
- No procedural builder calls remain for replaced asset types (grep shows the
  GLB loader is used instead).

### Scope

Only `assets/`, `src/` (asset loading + world building), `tools/`, `test/`.
Do not change gameplay tuning in `src/logic.js` or test expectations. Keep
the existing procedural builders as a fallback path until each GLB
replacement is wired in and verified; remove only at the end.

### Loop

Work the queue one asset at a time: build in Blender via MCP → render a
review shot → inspect the render → iterate until realistically detailed →
export GLB → wire into the game → run the validator.

### Stop rule

If the Blender MCP connection fails repeatedly or a required tool is missing,
stop and report rather than faking progress. If a specific asset cannot reach
"realistic" after several render iterations, note it in the report and move
to the next queue item rather than stalling the whole goal.

No budget cap.
