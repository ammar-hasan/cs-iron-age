# IRON AGE — Tactical Brawler

A 3D team-based tactical brawler prototype: Counter-Strike 1.6's round structure
meets Iron Age melee. Two warbands fight short rounds — first to 5 rounds wins
the match. Melee is the decision-maker; shields, kicks, and spacing define the
fight; bows and pila soften and punish but don't dominate.

## Modes (press `M` on the menu)

- **ANNIHILATION** — last team standing wins the round. Pure CS 1.6 DNA.
- **BANNER OF KINGS** — hold the mid ring to raise your standard: a tug-of-war
  meter fills for the team alone in the ring (faster with more bodies, decays
  when empty, freezes while contested). Cap it to take the round — or just
  eliminate the enemy warband the old way.

## Run

```sh
python3 -m http.server 8000     # or: npm run serve
# open http://localhost:8000
```

No build step. Three.js is vendored in `vendor/` — works offline.

## Controls

| Input | Action |
| --- | --- |
| WASD / Shift | Move / walk slow |
| Mouse | Look |
| LMB | Slash (wide arc) |
| V | Thrust (long reach, narrow) |
| RMB hold | Raise shield (blocks frontal hits, drains stamina) |
| F | Kick (staggers turtles, breaks guards) |
| Space | Jump |
| E | Mount / dismount a beast |
| 1 / 2 | Melee / ranged weapon |
| LMB (ranged slot) | Hold to draw bow, release to loose / throw pilum |
| 1–5 (menu) | Pick loadout |
| M (menu) | Switch mode: Annihilation / Banner of Kings |

## Beasts of war

Each warband's pen holds a **Courser** (horse — fast, fragile), a **Dromedary**
(camel — sturdy middle ground), and a **War Elephant** (slow fortress, tramples
for 55). Mounts steer with momentum: they turn at a capped rate and must build
speed, so cavalry commits to its charges. At full gallop a mount tramples
anything in its path (per-target cooldown). You can slash and shoot from the
saddle — and the beast can be cut down under its rider, who falls stunned.
One bot per team rides cavalry; killing the mount first is a valid tactic.

## Loadouts

- **Legionary** — gladius + scutum. The anchor.
- **Spearman** — dory spear + shield. Long reach, holds lanes.
- **Reaver** — falx, no shield. Heavy blade, chips through and shatters guards.
- **Skirmisher** — 3 pila to soften at mid-range, dagger to finish.
- **Archer** — recurve bow (10 arrows, headshots ×2) + dagger. Kites, punishes over-aggression.

Ranged is the supporting tool, not the star: arrow body shots hit for 45 (kill needs
three), shields stop frontal arrows at a stamina cost, and drawing a bow slows you
to a walk — overexpose yourself and a reaver will close the distance.

## Test

```sh
node test/logic.test.mjs    # pure logic: combat math, match + banner state machines
node test/sim.test.mjs      # headless full rounds: melee, archery, shields, banner win
node test/mounts.test.mjs   # mounts: driving, trample, mount death, melee vs beast
```

## Layout

- `src/logic.js` — pure, DOM-free game rules: weapons, melee, projectiles, mounts, match + banner state machines
- `src/world.js` — Oasis Crossing arena: geometry, colliders, spawns
- `src/entities.js` — Unit (player/bot shared): humanoid meshes, combat state machine, movement
- `src/player.js` — first-person rig: input, camera, viewmodel animation
- `src/ai.js` — bot brains: spacing, strikes, blocks, kicks, archery, cavalry
- `src/mounts.js` / `src/projectiles.js` — beasts, arrows & pila
- `src/hud.js` / `src/audio.js` — DOM HUD, procedural WebAudio SFX
- `src/main.js` — glue: loop, teams, modes, match orchestration, effects
