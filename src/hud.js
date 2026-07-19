// DOM HUD wiring.

const $ = (id) => document.getElementById(id);

const els = {};
let bannerT = 0;
let hitT = 0;

export function initHud() {
  for (const id of [
    'crosshair', 'scoreA', 'scoreB', 'timer', 'roundline', 'aliveA', 'aliveB',
    'hpfill', 'stfill', 'wname', 'wsub', 'feed', 'banner', 'bannerBig', 'bannerSmall',
    'vignette', 'overlay', 'loadouts', 'objtext', 'modename',
    'interact', 'mountbar', 'mountname', 'mountfill', 'bannermeter', 'bmfill',
  ]) els[id] = $(id);
  return els;
}

export function setScore(a, b) {
  els.scoreA.textContent = a;
  els.scoreB.textContent = b;
}

export function setTimer(t, phase) {
  if (phase === 'end' || phase === 'matchEnd') {
    els.timer.textContent = '—';
    return;
  }
  const s = Math.max(0, Math.ceil(t));
  const m = Math.floor(s / 60);
  els.timer.textContent = `${m}:${String(s % 60).padStart(2, '0')}`;
  els.timer.style.color = phase === 'freeze' ? '#ffd24a' : '';
}

export function setRound(r) {
  els.roundline.textContent = `Round ${r}`;
}

export function setAlive(a, b) {
  els.aliveA.textContent = '⚔'.repeat(a) || '—';
  els.aliveB.textContent = '⚔'.repeat(b) || '—';
}

export function setVitals(hp, st) {
  els.hpfill.style.width = `${Math.max(0, hp)}%`;
  els.stfill.style.width = `${Math.max(0, st)}%`;
  els.hpfill.style.background = hp < 30 ? '#d43a24' : '';
}

let lastWName = null, lastWSub = null;
export function setWeapon(name, sub) {
  if (name !== lastWName) { els.wname.textContent = name; lastWName = name; }
  if (sub !== undefined && sub !== lastWSub) { els.wsub.textContent = sub; lastWSub = sub; }
}

// Bow charge glow on the crosshair (null to clear).
export function setCharge(p) {
  if (p == null) {
    els.crosshair.style.boxShadow = '';
    els.crosshair.style.width = '';
    els.crosshair.style.height = '';
    return;
  }
  const glow = 4 + p * 12;
  els.crosshair.style.boxShadow = `0 0 ${glow}px rgba(255,210,74,${0.35 + p * 0.6})`;
  const s = `${6 + p * 5}px`;
  els.crosshair.style.width = s;
  els.crosshair.style.height = s;
}

export function setObjective(text) {
  els.objtext.textContent = text;
}

let lastInteract = null;
export function setInteract(text) {
  if (text === lastInteract) return;
  lastInteract = text;
  if (!text) {
    els.interact.classList.add('hidden');
  } else {
    els.interact.textContent = text;
    els.interact.classList.remove('hidden');
  }
}

export function setMount(name, frac) {
  if (frac == null) {
    els.mountbar.style.display = 'none';
    return;
  }
  els.mountbar.style.display = 'block';
  els.mountname.textContent = name;
  els.mountfill.style.width = `${Math.max(0, Math.round(frac * 100))}%`;
}

export function setModeName(name) {
  els.modename.textContent = name;
}

// Banner tug-of-war meter: v in [-1, 1] (+ favors team A), null hides it.
export function setBannerMeter(v) {
  if (v == null) {
    els.bannermeter.classList.add('hidden');
    return;
  }
  els.bannermeter.classList.remove('hidden');
  const f = els.bmfill;
  const pct = Math.abs(v) * 50;
  if (v >= 0) {
    f.style.left = '50%';
    f.style.width = `${pct}%`;
    f.style.background = '#c1502e';
  } else {
    f.style.left = `${50 - pct}%`;
    f.style.width = `${pct}%`;
    f.style.background = '#3d7ea6';
  }
}

export function banner(big, small = '', dur = 2.6) {
  els.bannerBig.textContent = big;
  els.bannerSmall.textContent = small;
  els.banner.classList.remove('hidden');
  bannerT = dur;
}

export function killfeed(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  els.feed.prepend(div);
  while (els.feed.children.length > 6) els.feed.removeChild(els.feed.lastChild);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
}

export function hitmarker(kill) {
  els.crosshair.classList.remove('hit', 'kill');
  void els.crosshair.offsetWidth; // restart animation
  els.crosshair.classList.add(kill ? 'kill' : 'hit');
  hitT = 0.25;
}

export function damageFlash() {
  els.vignette.classList.add('hurt');
  setTimeout(() => els.vignette.classList.remove('hurt'), 130);
}

export function showOverlay(show) {
  els.overlay.classList.toggle('hidden', !show);
}

export function updateHud(dt) {
  if (bannerT > 0) {
    bannerT -= dt;
    if (bannerT <= 0) els.banner.classList.add('hidden');
  }
  if (hitT > 0) {
    hitT -= dt;
    if (hitT <= 0) els.crosshair.classList.remove('hit', 'kill');
  }
}

export function feedName(unit, playerUnit) {
  const cls = unit.team === 'A' ? 'a' : 'b';
  const me = unit === playerUnit ? ' me' : '';
  return `<span class="${cls}${me}">${unit.name}</span>`;
}
