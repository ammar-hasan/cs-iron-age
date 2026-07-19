// Procedural WebAudio SFX — no assets. Everything is synthesized.

let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function noiseBuffer(dur) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function env(node, t0, a, peak, d, sustain = 0) {
  node.gain.setValueAtTime(0, t0);
  node.gain.linearRampToValueAtTime(peak, t0 + a);
  node.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.001), t0 + a + d);
}

function play(build) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  build(t0);
}

// Sword swing whoosh — band-passed noise sweep.
export function whoosh() {
  play((t0) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.22);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(400, t0);
    bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.14);
    const g = ctx.createGain();
    env(g, t0, 0.02, 0.35, 0.16);
    src.connect(bp).connect(g).connect(master);
    src.start(t0); src.stop(t0 + 0.24);
  });
}

// Metal clang — shields/parries.
export function clang() {
  play((t0) => {
    for (const [freq, peak, dec] of [[523, 0.30, 0.18], [1245, 0.22, 0.12], [2093, 0.15, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = 'square'; o.frequency.value = freq * (0.96 + Math.random() * 0.08);
      const g = ctx.createGain();
      env(g, t0, 0.004, peak, dec);
      o.connect(g).connect(master);
      o.start(t0); o.stop(t0 + dec + 0.05);
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.06);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = ctx.createGain(); env(g, t0, 0.002, 0.25, 0.05);
    src.connect(hp).connect(g).connect(master);
    src.start(t0); src.stop(t0 + 0.07);
  });
}

// Flesh thud.
export function thud() {
  play((t0) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t0);
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.12);
    const g = ctx.createGain();
    env(g, t0, 0.005, 0.6, 0.14);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + 0.2);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.05);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g2 = ctx.createGain(); env(g2, t0, 0.002, 0.3, 0.05);
    src.connect(lp).connect(g2).connect(master);
    src.start(t0); src.stop(t0 + 0.06);
  });
}

// Kick impact.
export function bootThump() {
  play((t0) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.15);
    const g = ctx.createGain();
    env(g, t0, 0.004, 0.7, 0.18);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + 0.25);
  });
}

// War horn — round start.
export function horn() {
  play((t0) => {
    for (const [note, delay, dur] of [[146.8, 0, 0.9], [220, 0.25, 0.8]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = note;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = ctx.createGain();
      const s = t0 + delay;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.22, s + 0.08);
      g.gain.setValueAtTime(0.22, s + dur - 0.15);
      g.gain.linearRampToValueAtTime(0, s + dur);
      o.connect(lp).connect(g).connect(master);
      o.start(s); o.stop(s + dur + 0.05);
    }
  });
}

// Round win / lose stings.
export function sting(win) {
  play((t0) => {
    const seq = win ? [[293.7, 0], [392, 0.14], [587.3, 0.28]] : [[220, 0], [174.6, 0.18], [146.8, 0.36]];
    for (const [freq, delay] of seq) {
      const o = ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = freq;
      const g = ctx.createGain();
      const s = t0 + delay;
      env(g, s, 0.02, 0.25, 0.5);
      o.connect(g).connect(master);
      o.start(s); o.stop(s + 0.6);
    }
  });
}

// Bow release twang.
export function bowLoose() {
  play((t0) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t0);
    o.frequency.exponentialRampToValueAtTime(90, t0 + 0.08);
    const g = ctx.createGain();
    env(g, t0, 0.003, 0.3, 0.1);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + 0.15);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.12);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800;
    const g2 = ctx.createGain(); env(g2, t0, 0.005, 0.15, 0.1);
    src.connect(bp).connect(g2).connect(master);
    src.start(t0); src.stop(t0 + 0.13);
  });
}

// Arrow / javelin fly-by.
export function flyBy() {
  play((t0) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.18);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(3200, t0);
    bp.frequency.exponentialRampToValueAtTime(700, t0 + 0.16);
    const g = ctx.createGain();
    env(g, t0, 0.02, 0.18, 0.15);
    src.connect(bp).connect(g).connect(master);
    src.start(t0); src.stop(t0 + 0.2);
  });
}

// Death grunt-ish.
export function deathCry() {
  play((t0) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t0);
    o.frequency.exponentialRampToValueAtTime(70, t0 + 0.35);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain();
    env(g, t0, 0.02, 0.28, 0.35);
    o.connect(lp).connect(g).connect(master);
    o.start(t0); o.stop(t0 + 0.45);
  });
}
