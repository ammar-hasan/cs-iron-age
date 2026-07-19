// Pure game logic: math helpers, weapon/loadout data, melee resolution,
// and the round/match state machine. No DOM, no three.js — node-testable.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Smallest signed difference between angles a and b, in (-PI, PI].
export function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Facing convention: yaw `face` means forward vector (sin(face), 0, cos(face)).
export function forwardVec(face) {
  return { x: Math.sin(face), z: Math.cos(face) };
}

// Is point B within `range` and within +/- halfArc radians of A's facing?
export function inArc(ax, az, aface, bx, bz, range, halfArc) {
  const dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist > range) return false;
  if (dist < 1e-6) return true;
  const ang = Math.atan2(dx, dz);
  return Math.abs(angDiff(ang, aface)) <= halfArc;
}

// ---------------------------------------------------------------------------
// Weapons & loadouts (Iron Age arsenal)
// ---------------------------------------------------------------------------

export const WEAPONS = {
  gladius: {
    id: 'gladius', name: 'Iron Gladius', slot: 'melee',
    dmg: 30, thrustDmg: 40, range: 2.15, thrustRange: 2.6,
    arc: 1.05, thrustArc: 0.38,
    windup: 0.16, active: 0.12, recover: 0.30,
    stagger: 0.22, knock: 0.9,
  },
  spear: {
    id: 'spear', name: 'Dory Spear', slot: 'melee',
    dmg: 26, thrustDmg: 46, range: 2.3, thrustRange: 3.5,
    arc: 0.65, thrustArc: 0.30,
    windup: 0.24, active: 0.14, recover: 0.42,
    stagger: 0.26, knock: 1.3,
  },
  falx: {
    id: 'falx', name: 'Falx Reaver', slot: 'melee',
    dmg: 55, thrustDmg: 30, range: 2.5, thrustRange: 2.3,
    arc: 1.20, thrustArc: 0.35,
    windup: 0.34, active: 0.16, recover: 0.52,
    stagger: 0.40, knock: 1.8, guardBreak: true,
  },
  dagger: {
    id: 'dagger', name: 'Bronze Dagger', slot: 'melee',
    dmg: 22, thrustDmg: 28, range: 1.7, thrustRange: 1.9,
    arc: 1.10, thrustArc: 0.40,
    windup: 0.11, active: 0.10, recover: 0.22,
    stagger: 0.16, knock: 0.6,
  },
  bow: {
    id: 'bow', name: 'Recurve Bow', slot: 'ranged',
    dmg: 45, headshotMult: 2.0, drawTime: 0.9, arrowSpeed: 34, gravity: 9.5,
    ammo: 10, spreadHip: 0.035,
  },
  javelin: {
    id: 'javelin', name: 'Pila (Throwing)', slot: 'thrown',
    dmg: 62, speed: 20, gravity: 10.5, ammo: 3, arcHint: 0.35,
  },
};

export const LOADOUTS = {
  legionary: { id: 'legionary', name: 'Legionary', weapon: 'gladius', shield: true, speed: 1.0, desc: 'Gladius + scutum. The anchor.' },
  spearman: { id: 'spearman', name: 'Spearman', weapon: 'spear', shield: true, speed: 0.95, desc: 'Long reach, holds lanes.' },
  reaver: { id: 'reaver', name: 'Reaver', weapon: 'falx', shield: false, speed: 1.06, desc: 'Heavy blade, breaks guards.' },
  skirmisher: { id: 'skirmisher', name: 'Skirmisher', weapon: 'dagger', shield: false, ranged: 'javelin', speed: 1.12, desc: 'Pila to soften, dagger to finish.' },
  archer: { id: 'archer', name: 'Archer', weapon: 'dagger', shield: false, ranged: 'bow', speed: 1.04, desc: 'Bow pressure, fragile up close.' },
};

export const MAX_HP = 100;
export const MAX_STAMINA = 100;

export const BLOCK_HALF_ARC = 0.9;        // frontal cone a shield covers (~51 deg)
export const BLOCK_COST = 26;             // stamina per blocked hit
export const GUARD_BREAK_COST = 42;       // stamina per blocked guard-breaking hit
export const GUARD_BREAK_STAGGER = 1.1;   // s, when stamina hits 0 while blocking
export const STAMINA_REGEN = 16;          // per second
export const STAMINA_REGEN_DELAY = 0.7;   // s after spending
export const KICK = {
  dmg: 5, range: 1.8, halfArc: 0.8, stagger: 0.85, knock: 2.2,
  cost: 18, windup: 0.10, recover: 0.35,
};

// ---------------------------------------------------------------------------
// Melee resolution (pure): given attacker swing + defender state, compute outcome.
// attacker: { x, z, face, weapon (id), kind: 'slash'|'thrust' }
// defender: { x, z, face, blocking, hasShield, stamina }
// Returns { hit, dmg, blocked, guardBroken, stagger, staminaDelta, knock }
// ---------------------------------------------------------------------------

export function resolveStrike(attacker, defender) {
  const w = WEAPONS[attacker.weapon];
  const thrust = attacker.kind === 'thrust';
  const range = thrust ? w.thrustRange : w.range;
  const halfArc = thrust ? w.thrustArc : w.arc;
  if (!inArc(attacker.x, attacker.z, attacker.face, defender.x, defender.z, range, halfArc)) {
    return { hit: false, dmg: 0, blocked: false, guardBroken: false, stagger: 0, staminaDelta: 0, knock: 0 };
  }
  const dmg = thrust ? w.thrustDmg : w.dmg;

  // Shield block: defender must be blocking and facing the attacker.
  if (defender.blocking && defender.hasShield) {
    const facingAttacker = inArc(
      defender.x, defender.z, defender.face,
      attacker.x, attacker.z, 99, BLOCK_HALF_ARC,
    );
    if (facingAttacker) {
      const cost = w.guardBreak ? GUARD_BREAK_COST : BLOCK_COST;
      const staminaAfter = defender.stamina - cost;
      if (staminaAfter <= 0) {
        // Guard shatters: partial damage leaks, long stagger.
        return {
          hit: true, dmg: Math.round(dmg * 0.5), blocked: false, guardBroken: true,
          stagger: GUARD_BREAK_STAGGER, staminaDelta: -defender.stamina, knock: w.knock * 1.5,
        };
      }
      return {
        hit: true, dmg: w.guardBreak ? Math.round(dmg * 0.25) : 0, blocked: true,
        guardBroken: false, stagger: 0.1, staminaDelta: -cost, knock: w.knock * 0.5,
      };
    }
  }
  return {
    hit: true, dmg, blocked: false, guardBroken: false,
    stagger: w.stagger, staminaDelta: 0, knock: w.knock,
  };
}

// ---------------------------------------------------------------------------
// Projectiles (pure helpers)
// ---------------------------------------------------------------------------

// Line of sight: does the segment A->B cross any axis-aligned box?
// Boxes are duck-typed { min: {x,y,z}, max: {x,y,z} } (three.Box3 compatible).
export function losClear(ax, ay, az, bx, by, bz, boxes) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const b of boxes) {
    let tmin = 0, tmax = 1;
    let ok = true;
    const o = [ax, ay, az], d = [dx, dy, dz];
    const mn = [b.min.x, b.min.y, b.min.z], mx = [b.max.x, b.max.y, b.max.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < mn[i] || o[i] > mx[i]) { ok = false; break; }
      } else {
        let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok) return false;
  }
  return true;
}

// Where does a projectile point land on a standing humanoid?
// Returns 'head' | 'body' | null. Target at (tx, tz), feet at baseY.
export function projectileHitZone(px, py, pz, tx, tz, baseY = 0) {
  const hd = Math.hypot(px - tx, pz - tz);
  if (hd < 0.32 && Math.abs(py - (baseY + 1.78)) < 0.32) return 'head';
  if (hd < 0.46 && py > baseY + 0.1 && py < baseY + 1.72) return 'body';
  return null;
}

// Is a raised shield stopping a projectile travelling along (vx, vz)?
// defFace: defender yaw; projectile velocity points from shooter to defender.
export function shieldStopsProjectile(defFace, vx, vz) {
  const f = forwardVec(defFace);
  const vl = Math.hypot(vx, vz) || 1;
  const dot = (f.x * -vx + f.z * -vz) / vl;   // facing back toward the shooter?
  return dot > Math.cos(BLOCK_HALF_ARC);
}

export const PROJECTILES = {
  arrow: { speed: 34, gravity: 9.5, dmg: 45, headshotMult: 2.0, radius: 0.06, len: 0.75 },
  javelin: { speed: 20, gravity: 10.5, dmg: 62, headshotMult: 1.5, radius: 0.09, len: 1.5 },
};
export const BOW_BLOCK_STAMINA = 12;      // stamina to stop an arrow on the shield
export const THROW_WINDUP = 0.28;

// ---------------------------------------------------------------------------
// Mounts
// ---------------------------------------------------------------------------

export const MOUNTS = {
  horse: {
    id: 'horse', name: 'Courser', hp: 90, speed: 11, turn: 2.6, accel: 6, brake: 14,
    radius: 0.75, saddle: 1.5, height: 1.9,
    trample: { dmg: 16, knock: 2.6, stagger: 0.5 },
  },
  camel: {
    id: 'camel', name: 'Dromedary', hp: 150, speed: 8.5, turn: 1.9, accel: 4.5, brake: 12,
    radius: 0.8, saddle: 1.8, height: 2.2,
    trample: { dmg: 22, knock: 3.0, stagger: 0.6 },
  },
  elephant: {
    id: 'elephant', name: 'War Elephant', hp: 420, speed: 4.6, turn: 0.9, accel: 2.2, brake: 8,
    radius: 1.35, saddle: 2.55, height: 3.0,
    trample: { dmg: 55, knock: 4.5, stagger: 0.9 },
  },
};
export const TRAMPLE_CD = 0.9;         // s between trample hits on the same unit
export const MOUNT_INTERACT_DIST = 2.8;

// ---------------------------------------------------------------------------
// Round / match state machine (CS-style): freeze -> live -> end -> next round.
// Elimination or timer decides. First to winScore takes the match.
// ---------------------------------------------------------------------------

export function createMatch(cfg = {}) {
  return {
    freezeTime: cfg.freezeTime ?? 3,
    roundTime: cfg.roundTime ?? 115,
    endTime: cfg.endTime ?? 5,
    winScore: cfg.winScore ?? 5,
    phase: 'freeze',           // 'freeze' | 'live' | 'end' | 'matchEnd'
    t: cfg.freezeTime ?? 3,
    round: 1,
    score: { A: 0, B: 0 },
    lastWinner: null,
    lastReason: null,
  };
}

// Shared round-resolution path (elimination, timer, or objective).
export function endRound(m, winner, reason) {
  const events = [];
  if (winner) m.score[winner] += 1;
  m.lastWinner = winner;
  m.lastReason = reason;
  events.push({ type: 'roundEnd', winner, reason, round: m.round, score: { ...m.score } });
  const matchWinner = m.score.A >= m.winScore ? 'A' : m.score.B >= m.winScore ? 'B' : null;
  if (matchWinner) {
    m.phase = 'matchEnd';
    m.t = m.endTime;
    events.push({ type: 'matchEnd', winner: matchWinner, score: { ...m.score } });
  } else {
    m.phase = 'end';
    m.t = m.endTime;
  }
  return events;
}

// Objective modes can force a round to end (e.g. banner raised).
export function forceRoundEnd(m, winner, reason) {
  if (m.phase !== 'live') return [];
  return endRound(m, winner, reason);
}

// alive: { A: {count, hp}, B: {count, hp} } — hp = summed remaining hit points.
// Returns an array of events fired this tick.
export function updateMatch(m, dt, alive) {
  const events = [];
  m.t -= dt;

  if (m.phase === 'freeze') {
    if (m.t <= 0) {
      m.phase = 'live';
      m.t = m.roundTime;
      events.push({ type: 'liveStart', round: m.round });
    }
    return events;
  }

  if (m.phase === 'live') {
    let winner = null, reason = null;
    if (alive.A.count === 0 && alive.B.count === 0) { winner = null; reason = 'mutual'; }
    else if (alive.B.count === 0) { winner = 'A'; reason = 'elimination'; }
    else if (alive.A.count === 0) { winner = 'B'; reason = 'elimination'; }
    else if (m.t <= 0) {
      if (alive.A.count !== alive.B.count) {
        winner = alive.A.count > alive.B.count ? 'A' : 'B';
        reason = 'time-numbers';
      } else if (Math.abs(alive.A.hp - alive.B.hp) > 0.5) {
        winner = alive.A.hp > alive.B.hp ? 'A' : 'B';
        reason = 'time-damage';
      } else {
        winner = null; reason = 'draw';
      }
    }
    if (reason) return endRound(m, winner, reason);
    return events;
  }

  if (m.phase === 'end') {
    if (m.t <= 0) {
      m.phase = 'freeze';
      m.t = m.freezeTime;
      m.round += 1;
      events.push({ type: 'freezeStart', round: m.round });
    }
    return events;
  }

  // matchEnd: terminal until resetMatch()
  return events;
}

// ---------------------------------------------------------------------------
// Banner of Kings (control mode): tug-of-war meter over the mid standard.
// meter in [-cap, +cap]; + favors A, - favors B. Hit either cap to take the round.
// ---------------------------------------------------------------------------

export const BANNER = { radius: 4.8, rate: 14, decay: 10, cap: 100 };

export function createBanner() {
  return { meter: 0, leader: null };
}

// inRing: { A: n, B: n } — alive units inside the ring.
export function updateBanner(b, dt, inRing) {
  const events = [];
  const aOnly = inRing.A > 0 && inRing.B === 0;
  const bOnly = inRing.B > 0 && inRing.A === 0;
  if (aOnly) {
    b.meter += BANNER.rate * dt * Math.min(inRing.A, 3);
    b.leader = 'A';
  } else if (bOnly) {
    b.meter -= BANNER.rate * dt * Math.min(inRing.B, 3);
    b.leader = 'B';
  } else if (inRing.A === 0 && inRing.B === 0) {
    const d = BANNER.decay * dt;
    b.meter = Math.abs(b.meter) <= d ? 0 : b.meter - Math.sign(b.meter) * d;
    if (b.meter === 0) b.leader = null;
  }
  // contested ring: meter holds

  if (b.meter >= BANNER.cap) {
    b.meter = BANNER.cap;
    events.push({ type: 'bannerCapture', team: 'A' });
  } else if (b.meter <= -BANNER.cap) {
    b.meter = -BANNER.cap;
    events.push({ type: 'bannerCapture', team: 'B' });
  }
  return events;
}

export function resetMatch(m) {
  const fresh = createMatch({
    freezeTime: m.freezeTime, roundTime: m.roundTime,
    endTime: m.endTime, winScore: m.winScore,
  });
  Object.assign(m, fresh);
  return [{ type: 'freezeStart', round: 1 }];
}
