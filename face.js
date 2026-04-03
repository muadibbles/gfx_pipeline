// face.js — R1 Face · 2D Gaussian Splat Renderer
// Canvas: 800 × 800
'use strict';

(function () {

const canvas = document.getElementById('face');
const ctx    = canvas.getContext('2d');
const W = 800, H = 800, CX = 400, CY = 400;
const S   = W / 240;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ── BASE PARAMETERS ───────────────────────────────────────────────────────

const P = {
  eyeRx:       24 * S,
  eyeRy:       27 * S,
  eyeHalfGap:  40 * S,
  eyeOffsetY:  0,
  eyeTilt:     10,
  browXSpan:   20 * S,
  browThick:    3 * S,
  mouthThick:   3.5 * S,
  lookMax:     20 * S,
  lookDurMin:  150,  lookDurMax:  600,
  lookWaitMin: 800,  lookWaitMax: 3000,
  lookHoldMin: 400,  lookHoldMax: 2200,
  blinkWaitMin: 2500, blinkWaitMax: 5500,
  bgColor:    '#0d0d14',
  eyeColor:   [255, 255, 255],
  browColor:  [255, 255, 255],
  mouthColor: [255, 255, 255],
};

// ── GAUSSIAN SPLAT PARAMETERS ─────────────────────────────────────────────
// Every numeric knob the designer can tweak. Grouped by feature.

const GS = {
  // ── Gradient falloff — applies to ALL splats ──
  gradStop1Pos:    0.45,   // position of first interior stop  (0–1)
  gradStop1Alpha:  0.90,   // opacity multiplier at stop 1
  gradStop2Pos:    0.75,   // position of second interior stop (0–1)
  gradStop2Alpha:  0.15,   // opacity multiplier at stop 2

  // ── Eye splats ──
  eyeThickRatio:   0.13,   // ring thickness = min(rx, effRy) × ratio
  eyeThickMin:     4,      // minimum thickness px
  eyeGlowMult:     1.3,    // glow halo radius = thick × mult
  eyeGlowAlpha:    0.06,   // glow halo peak opacity
  eyeCoreAlpha:    0.88,   // core splat peak opacity
  eyeMode:         0,      // 0 = ring, 1 = scatter
  eyeScatterCount: 200,    // splats in scatter mode
  eyeSpread:       0.4,    // radial scatter spread × thick

  // ── Brow splats ──
  browGlowMult:    1.2,
  browGlowAlpha:   0.09,
  browCoreAlpha:   0.90,

  // ── Mouth splats ──
  mouthGlowMult:   1.2,
  mouthGlowAlpha:  0.09,
  mouthCoreAlpha:  0.90,

  // ── Arc stroke mode (brows + mouth) ──
  strokeMode:      0,      // 0 = chain, 1 = scatter
  strokeCount:     80,     // splats per arc in scatter mode
  strokeSpread:    1.5,    // perpendicular scatter spread × thick
};

// ── EMOTION PRESETS ───────────────────────────────────────────────────────

const EM = {
  neutral: {
    eyeRyScale: 1.00, eyeYShift:    0, lidRest: 0.00, blinkMult: 1.0,
    browYL: -16*S, browYR: -16*S, browCL:  3*S, browCR:  3*S, browAngle:  0,
    mouthY: 40*S, mouthW: 18*S, mouthC:  2*S, mouthOpen:    0, transDur: 300,
  },
  attentive: {
    eyeRyScale: 1.15, eyeYShift:    0, lidRest: 0.00, blinkMult: 0.5,
    browYL: -18*S, browYR: -18*S, browCL:  4*S, browCR:  4*S, browAngle:  0,
    mouthY: 40*S, mouthW: 16*S, mouthC:  1*S, mouthOpen:    0, transDur: 300,
  },
  happy: {
    eyeRyScale: 0.70, eyeYShift:    0, lidRest: 0.15, blinkMult: 1.2,
    browYL: -20*S, browYR: -20*S, browCL:  5*S, browCR:  5*S, browAngle:  0,
    mouthY: 40*S, mouthW: 22*S, mouthC:  8*S, mouthOpen:    0, transDur: 250,
  },
  surprised: {
    eyeRyScale: 1.35, eyeYShift: -4*S, lidRest: 0.00, blinkMult: 0.3,
    browYL: -22*S, browYR: -22*S, browCL:  2*S, browCR:  2*S, browAngle:  0,
    mouthY: 40*S, mouthW: 12*S, mouthC: -1*S, mouthOpen: 20*S, transDur: 150,
  },
  thinking: {
    eyeRyScale: 0.90, eyeYShift:    0, lidRest: 0.10, blinkMult: 0.8,
    browYL: -14*S, browYR: -18*S, browCL:  2*S, browCR:  4*S, browAngle:  8,
    mouthY: 40*S, mouthW: 14*S, mouthC:  0,   mouthOpen:    0, transDur: 400,
  },
  tired: {
    eyeRyScale: 0.75, eyeYShift:  2*S, lidRest: 0.25, blinkMult: 2.0,
    browYL: -10*S, browYR: -10*S, browCL:  1*S, browCR:  1*S, browAngle: -5,
    mouthY: 42*S, mouthW: 16*S, mouthC: -2*S, mouthOpen:    0, transDur: 500,
  },
};

// ── ANIMATION STATE ───────────────────────────────────────────────────────

const st = {
  emoKey:  'neutral',
  prevKey: 'neutral',
  emoT:    1,
  blink:   0,
  lookX:   0,
  lookY:   0,
};

// ── SEEDED LCG RNG ────────────────────────────────────────────────────────
// Returns a function that yields a deterministic sequence from [0, 1).
// Same seed → same scatter layout every frame (no shimmer).

function makeLCG(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
}

// ── GAUSSIAN SPLAT PRIMITIVE ──────────────────────────────────────────────

function splat(x, y, sx, sy, a, r, g, b, alpha) {
  if (alpha < 0.005 || sx <= 0 || sy <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(sx, sy);
  const R  = 3;
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  gr.addColorStop(0,               `rgba(${r},${g},${b},${alpha.toFixed(4)})`);
  gr.addColorStop(GS.gradStop1Pos, `rgba(${r},${g},${b},${(alpha * GS.gradStop1Alpha).toFixed(4)})`);
  gr.addColorStop(GS.gradStop2Pos, `rgba(${r},${g},${b},${(alpha * GS.gradStop2Alpha).toFixed(4)})`);
  gr.addColorStop(1,               `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ── BÉZIER HELPERS ────────────────────────────────────────────────────────

function qbez(x0, y0, x1, y1, x2, y2, t) {
  const m = 1 - t;
  return [m*m*x0 + 2*m*t*x1 + t*t*x2,
          m*m*y0 + 2*m*t*y1 + t*t*y2];
}

// Returns the unit perpendicular to the Bézier tangent at t.
function qbezPerp(x0, y0, x1, y1, x2, y2, t) {
  const e  = t < 0.999 ? 0.001 : -0.001;
  const [ax, ay] = qbez(x0, y0, x1, y1, x2, y2, t);
  const [bx, by] = qbez(x0, y0, x1, y1, x2, y2, t + e);
  const tx = (bx - ax) * (e > 0 ? 1 : -1);
  const ty = (by - ay) * (e > 0 ? 1 : -1);
  const len = Math.sqrt(tx*tx + ty*ty) || 1;
  return [-ty / len, tx / len];   // rotate tangent 90°
}

// ── ARC — CHAIN MODE ──────────────────────────────────────────────────────

function drawArcChain(cx, cy, xSpan, curve, rot, thick, r, g, b, coreA, glowM, glowA) {
  const N    = Math.max(6, Math.ceil((xSpan * 2) / (thick * 0.85)));
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [lx, ly] = qbez(-xSpan, 0, 0, -curve, xSpan, 0, t);
    const wx = cx + lx * cosR - ly * sinR;
    const wy = cy + lx * sinR + ly * cosR;
    splat(wx, wy, thick * glowM, thick * glowM, 0, r, g, b, coreA * glowA);
    splat(wx, wy, thick,         thick,         0, r, g, b, coreA);
  }
}

// ── ARC — SCATTER MODE ────────────────────────────────────────────────────

function drawArcScatter(cx, cy, xSpan, curve, rot, thick, r, g, b, coreA, glowM, glowA, seed) {
  const rng    = makeLCG(seed);
  const cosR   = Math.cos(rot), sinR = Math.sin(rot);
  const spread = thick * GS.strokeSpread;

  for (let i = 0; i < GS.strokeCount; i++) {
    const t     = rng();
    const perp  = (rng() * 2 - 1) * spread;
    const szmul = 0.35 + rng() * 0.90;
    const amul  = 0.35 + rng() * 0.75;

    const [lx, ly] = qbez(-xSpan, 0, 0, -curve, xSpan, 0, t);
    const [px, py] = qbezPerp(-xSpan, 0, 0, -curve, xSpan, 0, t);

    const ox = lx + px * perp;
    const oy = ly + py * perp;
    const wx = cx + ox * cosR - oy * sinR;
    const wy = cy + ox * sinR + oy * cosR;

    const sz = thick * szmul;
    splat(wx, wy, sz * glowM, sz * glowM, 0, r, g, b, coreA * glowA * amul);
    splat(wx, wy, sz,         sz,         0, r, g, b, coreA * amul);
  }
}

// ── ARC DISPATCHER ────────────────────────────────────────────────────────

function drawArc(cx, cy, xSpan, curve, rot, thick, r, g, b, coreA, glowM, glowA, seed) {
  if (GS.strokeMode === 1) {
    drawArcScatter(cx, cy, xSpan, curve, rot, thick, r, g, b, coreA, glowM, glowA, seed);
  } else {
    drawArcChain(cx, cy, xSpan, curve, rot, thick, r, g, b, coreA, glowM, glowA);
  }
}

// ── EYE — RING MODE ───────────────────────────────────────────────────────

function drawEyeRing(cx, cy, rx, ry, tiltDeg, lidClosure, r, g, b) {
  const tiltRad = tiltDeg * DEG;
  const effRy   = ry * Math.max(0, 1 - lidClosure);
  if (effRy < 1) return;
  const thick = Math.max(GS.eyeThickMin, Math.min(rx, effRy) * GS.eyeThickRatio);
  const perim = Math.PI * (3*(rx + effRy) - Math.sqrt((3*rx + effRy)*(rx + 3*effRy)));
  const N     = Math.max(24, Math.ceil(perim / (thick * 1.3)));
  const cosT  = Math.cos(tiltRad), sinT = Math.sin(tiltRad);
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * TAU;
    const lx = rx    * Math.cos(theta);
    const ly = effRy * Math.sin(theta);
    const wx = cx + lx * cosT - ly * sinT;
    const wy = cy + lx * sinT + ly * cosT;
    splat(wx, wy, thick * GS.eyeGlowMult, thick * GS.eyeGlowMult, 0, r, g, b, GS.eyeGlowAlpha);
    splat(wx, wy, thick,                  thick,                   0, r, g, b, GS.eyeCoreAlpha);
  }
}

// ── EYE — SCATTER MODE ────────────────────────────────────────────────────

function drawEyeScatter(cx, cy, rx, ry, tiltDeg, lidClosure, r, g, b, seed) {
  const tiltRad = tiltDeg * DEG;
  const effRy   = ry * Math.max(0, 1 - lidClosure);
  if (effRy < 1) return;
  const thick  = Math.max(GS.eyeThickMin, Math.min(rx, effRy) * GS.eyeThickRatio);
  const spread = thick * GS.eyeSpread;
  const rng    = makeLCG(seed);
  const cosT   = Math.cos(tiltRad), sinT = Math.sin(tiltRad);

  for (let i = 0; i < GS.eyeScatterCount; i++) {
    const theta  = rng() * TAU;
    const radial = (rng() * 2 - 1) * spread;
    const szmul  = 0.30 + rng() * 0.90;
    const amul   = 0.30 + rng() * 0.80;

    const lx = (rx    + radial) * Math.cos(theta);
    const ly = (effRy + radial) * Math.sin(theta);
    const wx = cx + lx * cosT - ly * sinT;
    const wy = cy + lx * sinT + ly * cosT;

    const sz = thick * szmul;
    splat(wx, wy, sz * GS.eyeGlowMult, sz * GS.eyeGlowMult, 0, r, g, b, GS.eyeGlowAlpha * amul);
    splat(wx, wy, sz,                  sz,                   0, r, g, b, GS.eyeCoreAlpha  * amul);
  }
}

// ── EYE DISPATCHER ────────────────────────────────────────────────────────

function drawEye(cx, cy, rx, ry, tiltDeg, lidClosure, r, g, b, seed) {
  if (GS.eyeMode === 1) {
    drawEyeScatter(cx, cy, rx, ry, tiltDeg, lidClosure, r, g, b, seed);
  } else {
    drawEyeRing(cx, cy, rx, ry, tiltDeg, lidClosure, r, g, b);
  }
}

// ── INTERPOLATION ─────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }
function eio(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }

function lerpEM(a, b, t) {
  const out = {};
  for (const k in a) out[k] = typeof a[k] === 'number' ? lerp(a[k], b[k], t) : b[k];
  return out;
}

// ── RENDER ────────────────────────────────────────────────────────────────

function render() {
  ctx.fillStyle = P.bgColor;
  ctx.fillRect(0, 0, W, H);

  const e = lerpEM(EM[st.prevKey], EM[st.emoKey], eio(st.emoT));
  const [er, eg, eb] = P.eyeColor;
  const [wr, wg, wb] = P.browColor;
  const [mr, mg, mb] = P.mouthColor;

  const lid   = Math.max(e.lidRest, st.blink);
  const eyeRy = P.eyeRy * e.eyeRyScale;
  const eyeY  = CY + P.eyeOffsetY + e.eyeYShift;
  const eyeLX = CX - P.eyeHalfGap + st.lookX;
  const eyeRX = CX + P.eyeHalfGap + st.lookX;

  // Eyes (seeds 4444/5555 keep L+R scatter layouts independent)
  drawEye(eyeLX, eyeY, P.eyeRx, eyeRy, -P.eyeTilt, lid, er, eg, eb, 4444);
  drawEye(eyeRX, eyeY, P.eyeRx, eyeRy,  P.eyeTilt, lid, er, eg, eb, 5555);

  // Brows (seeds 1111/2222 give L+R different scatter layouts)
  const browA = e.browAngle * DEG;
  drawArc(eyeLX, eyeY + e.browYL, P.browXSpan, e.browCL, -browA, P.browThick,
          wr, wg, wb, GS.browCoreAlpha, GS.browGlowMult, GS.browGlowAlpha, 1111);
  drawArc(eyeRX, eyeY + e.browYR, P.browXSpan, e.browCR,  browA, P.browThick,
          wr, wg, wb, GS.browCoreAlpha, GS.browGlowMult, GS.browGlowAlpha, 2222);

  // Mouth
  const mouthCX = CX + st.lookX * 0.12;
  const mouthCY = CY + e.mouthY;
  drawArc(mouthCX, mouthCY, e.mouthW, e.mouthC, 0, P.mouthThick,
          mr, mg, mb, GS.mouthCoreAlpha, GS.mouthGlowMult, GS.mouthGlowAlpha, 3333);
  if (e.mouthOpen > 2) {
    drawArc(mouthCX, mouthCY + e.mouthOpen, e.mouthW * 0.8, -e.mouthC * 0.5, 0, P.mouthThick,
            mr, mg, mb, GS.mouthCoreAlpha, GS.mouthGlowMult, GS.mouthGlowAlpha, 3334);
  }
}

// ── BLINK ─────────────────────────────────────────────────────────────────

const BLINK_PROFILES = {
  quick:  { close:  45, hold:  30, open:  70 },
  normal: { close:  72, hold:  52, open: 115 },
  slow:   { close: 130, hold: 100, open: 180 },
};

function rnd(a, b) { return a + Math.random() * (b - a); }

function scheduleBlink() {
  setTimeout(startBlink, rnd(P.blinkWaitMin, P.blinkWaitMax) / EM[st.emoKey].blinkMult);
}

function startBlink() {
  const keys  = Object.keys(BLINK_PROFILES);
  const p     = BLINK_PROFILES[keys[Math.floor(Math.random() * keys.length)]];
  const total = p.close + p.hold + p.open;
  const t0    = performance.now();
  function frame(now) {
    const t = now - t0;
    if      (t < p.close)           st.blink = t / p.close;
    else if (t < p.close + p.hold)  st.blink = 1;
    else if (t < total)             st.blink = 1 - (t - p.close - p.hold) / p.open;
    else                          { st.blink = 0; scheduleBlink(); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── LOOK ──────────────────────────────────────────────────────────────────

function scheduleLook() {
  setTimeout(startLook, rnd(P.lookWaitMin, P.lookWaitMax));
}

function startLook() {
  const tx = rnd(-P.lookMax, P.lookMax);
  const ty = rnd(-P.lookMax * 0.4, P.lookMax * 0.4);
  const dur = rnd(P.lookDurMin, P.lookDurMax);
  const ox = st.lookX, oy = st.lookY;
  const t0 = performance.now();
  function frame(now) {
    let t = Math.min(1, (now - t0) / dur);
    t = 1 - (1 - t) ** 3;
    st.lookX = lerp(ox, tx, t);
    st.lookY = lerp(oy, ty, t);
    if (t < 1) { requestAnimationFrame(frame); return; }
    setTimeout(scheduleLook, rnd(P.lookHoldMin, P.lookHoldMax));
  }
  requestAnimationFrame(frame);
}

// ── MAIN LOOP ─────────────────────────────────────────────────────────────

function tick() { render(); requestAnimationFrame(tick); }

// ── PUBLIC API ────────────────────────────────────────────────────────────

window.setEmotion = function (key) {
  if (!EM[key] || key === st.emoKey) return;
  st.prevKey = st.emoKey;
  st.emoKey  = key;
  st.emoT    = 0;
  const dur = EM[key].transDur;
  const t0  = performance.now();
  function anim(now) {
    st.emoT = Math.min(1, (now - t0) / dur);
    if (st.emoT < 1) requestAnimationFrame(anim);
  }
  requestAnimationFrame(anim);
};

// Exposed for the designer (read/write P, GS, EM directly)
window.faceAPI = { P, GS, EM, st, S };

// ── BOOT ──────────────────────────────────────────────────────────────────

scheduleBlink();
scheduleLook();
tick();

})();
