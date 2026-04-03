// face.js — R1 Face rendered with 2D Gaussian Splats
// Canvas: 800 × 800
// Reference design: muadibbles/r1_face (240 × 282)
'use strict';

(function () {

const canvas = document.getElementById('face');
const ctx    = canvas.getContext('2d');
const W = 800, H = 800, CX = 400, CY = 400;
const S   = W / 240;          // scale factor from 240-wide reference ≈ 3.33
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// ── BASE PARAMETERS ──────────────────────────────────────────────────────

const P = {
  // Eye geometry
  eyeRx:       24 * S,        // eye semi-axis horizontal
  eyeRy:       27 * S,        // eye semi-axis vertical
  eyeHalfGap:  40 * S,        // X offset of each eye centre from CX
  eyeOffsetY:  0,             // global Y nudge for both eyes
  eyeTilt:     10,            // degrees — outward cant per eye

  // Brow
  browXSpan:   20 * S,        // brow half-width
  browThick:    3 * S,        // splat 1-sigma for brow strokes

  // Mouth
  mouthThick:   3.5 * S,      // splat 1-sigma for mouth stroke

  // Gaze animation
  lookMax:     20 * S,
  lookDurMin:  150,  lookDurMax:  600,
  lookWaitMin: 800,  lookWaitMax: 3000,
  lookHoldMin: 400,  lookHoldMax: 2200,

  // Blink timing (ms)
  blinkWaitMin: 2500, blinkWaitMax: 5500,

  // Colours  (RGB 0-255)
  bgColor:    '#0d0d14',
  eyeColor:   [255, 255, 255],
  browColor:  [255, 255, 255],
  mouthColor: [255, 255, 255],
};

// ── EMOTION PRESETS ──────────────────────────────────────────────────────
// All pixel values are in scaled space (S already applied).
// browYL / browYR : brow Y offset relative to eye centre (negative = above)
// browCL / browCR : brow arch height (positive = arch upward)
// browAngle       : inner-tilt degrees (mirrored L/R)
// mouthY          : mouth centre Y below CY
// mouthW          : mouth half-width
// mouthC          : mouth arch height (positive = smile, negative = frown)
// mouthOpen       : lower-jaw separation (0 = closed)
// transDur        : transition duration in ms

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

// ── ANIMATION STATE ──────────────────────────────────────────────────────

const st = {
  emoKey:  'neutral',
  prevKey: 'neutral',
  emoT:    1,           // 0 → prevKey, 1 → emoKey
  blink:   0,           // 0 = open, 1 = fully closed
  lookX:   0,           // px offset applied to eye / brow centres
  lookY:   0,
};

// ── GAUSSIAN SPLAT PRIMITIVE ─────────────────────────────────────────────

/**
 * Render a single 2-D Gaussian splat.
 *
 * The canvas is transformed so the unit circle becomes a σ-ellipse,
 * then filled with a radial gradient that approximates e^{-r²/2}.
 *
 * (x, y)   – centre in canvas pixels
 * (sx, sy) – 1-sigma radii
 * a        – rotation angle in radians
 * r, g, b  – colour 0-255
 * alpha    – peak opacity 0-1
 */
function splat(x, y, sx, sy, a, r, g, b, alpha) {
  if (alpha <= 0 || sx <= 0 || sy <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(sx, sy);

  // Four stops approximate the Gaussian bell (e^{-r²/2} at r = 0, 1, 2, 3)
  const R = 3;
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  gr.addColorStop(0,    `rgba(${r},${g},${b},${alpha.toFixed(4)})`);
  gr.addColorStop(0.33, `rgba(${r},${g},${b},${(alpha * 0.61).toFixed(4)})`);
  gr.addColorStop(0.67, `rgba(${r},${g},${b},${(alpha * 0.14).toFixed(4)})`);
  gr.addColorStop(1,    `rgba(${r},${g},${b},0)`);

  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ── FEATURE RENDERERS ────────────────────────────────────────────────────

/** Quadratic Bézier point at parameter t. */
function qbez(x0, y0, x1, y1, x2, y2, t) {
  const m = 1 - t;
  return [m*m*x0 + 2*m*t*x1 + t*t*x2,
          m*m*y0 + 2*m*t*y1 + t*t*y2];
}

/**
 * Draw a curved stroke (brow or mouth) as a chain of overlapping splats.
 *
 * cx, cy  – pivot
 * xSpan   – half-width of the arc
 * curve   – Bézier apex offset (positive arches "up" in face space)
 * rot     – whole-arc rotation in radians
 * thick   – 1-sigma of each splat
 * r,g,b   – colour
 * alpha   – core opacity
 */
function drawArc(cx, cy, xSpan, curve, rot, thick, r, g, b, alpha) {
  const N    = Math.max(6, Math.ceil((xSpan * 2) / (thick * 0.85)));
  const cosR = Math.cos(rot), sinR = Math.sin(rot);

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [lx, ly] = qbez(-xSpan, 0, 0, -curve, xSpan, 0, t);
    const wx = cx + lx * cosR - ly * sinR;
    const wy = cy + lx * sinR + ly * cosR;

    splat(wx, wy, thick * 2.4, thick * 2.4, 0, r, g, b, alpha * 0.18); // soft glow
    splat(wx, wy, thick,       thick,       0, r, g, b, alpha);         // bright core
  }
}

/**
 * Draw one eye as a ring of Gaussian splats — a glowing outlined ellipse.
 *
 * lidClosure – 0 = fully open, 1 = fully closed (scales ry → 0)
 */
function drawEye(cx, cy, rx, ry, tiltDeg, lidClosure, r, g, b) {
  const tiltRad = tiltDeg * DEG;
  const effRy   = ry * Math.max(0, 1 - lidClosure);
  if (effRy < 1) return;

  // Splat thickness ~13% of the smaller semi-axis, minimum 4 px
  const thick = Math.max(4, Math.min(rx, effRy) * 0.13);

  // Ramanujan perimeter approximation → how many splats to place
  const perim = Math.PI * (3*(rx + effRy) - Math.sqrt((3*rx + effRy)*(rx + 3*effRy)));
  const N     = Math.max(24, Math.ceil(perim / (thick * 1.3)));

  const cosT = Math.cos(tiltRad), sinT = Math.sin(tiltRad);

  for (let i = 0; i < N; i++) {
    const theta = (i / N) * TAU;
    const lx = rx    * Math.cos(theta);
    const ly = effRy * Math.sin(theta);

    // Rotate by eye tilt
    const wx = cx + lx * cosT - ly * sinT;
    const wy = cy + lx * sinT + ly * cosT;

    splat(wx, wy, thick * 2.6, thick * 2.6, 0, r, g, b, 0.11); // outer glow halo
    splat(wx, wy, thick,       thick,       0, r, g, b, 0.88); // bright ring core
  }
}

// ── INTERPOLATION HELPERS ────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }
function eio(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; } // ease-in-out quad

/** Linearly interpolate all numeric fields between two emotion objects. */
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

  // ── Eyes
  drawEye(eyeLX, eyeY, P.eyeRx, eyeRy, -P.eyeTilt, lid, er, eg, eb);
  drawEye(eyeRX, eyeY, P.eyeRx, eyeRy,  P.eyeTilt, lid, er, eg, eb);

  // ── Brows (Y relative to eye centre — matches r1_face browYOffset convention)
  const browA = e.browAngle * DEG;
  drawArc(eyeLX, eyeY + e.browYL, P.browXSpan, e.browCL, -browA, P.browThick, wr, wg, wb, 0.9);
  drawArc(eyeRX, eyeY + e.browYR, P.browXSpan, e.browCR,  browA, P.browThick, wr, wg, wb, 0.9);

  // ── Mouth (follows gaze very slightly for liveliness)
  const mouthCX = CX + st.lookX * 0.12;
  const mouthCY = CY + e.mouthY;

  drawArc(mouthCX, mouthCY, e.mouthW, e.mouthC, 0, P.mouthThick, mr, mg, mb, 0.9);

  if (e.mouthOpen > 2) {
    // Lower jaw arc — mirrors upper curve slightly
    drawArc(mouthCX, mouthCY + e.mouthOpen, e.mouthW * 0.8, -e.mouthC * 0.5,
            0, P.mouthThick, mr, mg, mb, 0.85);
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
  const wait = rnd(P.blinkWaitMin, P.blinkWaitMax) / EM[st.emoKey].blinkMult;
  setTimeout(startBlink, wait);
}

function startBlink() {
  const keys  = Object.keys(BLINK_PROFILES);
  const p     = BLINK_PROFILES[keys[Math.floor(Math.random() * keys.length)]];
  const total = p.close + p.hold + p.open;
  const t0    = performance.now();

  function frame(now) {
    const t = now - t0;
    if      (t < p.close)             st.blink = t / p.close;
    else if (t < p.close + p.hold)    st.blink = 1;
    else if (t < total)               st.blink = 1 - (t - p.close - p.hold) / p.open;
    else                            { st.blink = 0; scheduleBlink(); return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── LOOK ──────────────────────────────────────────────────────────────────

function scheduleLook() {
  setTimeout(startLook, rnd(P.lookWaitMin, P.lookWaitMax));
}

function startLook() {
  const tx  = rnd(-P.lookMax, P.lookMax);
  const ty  = rnd(-P.lookMax * 0.4, P.lookMax * 0.4);
  const dur = rnd(P.lookDurMin, P.lookDurMax);
  const ox  = st.lookX, oy = st.lookY;
  const t0  = performance.now();

  function frame(now) {
    let t = Math.min(1, (now - t0) / dur);
    t = 1 - (1 - t) ** 3;           // ease-out cubic
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

/**
 * Transition to a named emotion.
 * Valid keys: 'neutral' | 'attentive' | 'happy' | 'surprised' | 'thinking' | 'tired'
 */
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

// ── BOOT ──────────────────────────────────────────────────────────────────

scheduleBlink();
scheduleLook();
tick();

})();
