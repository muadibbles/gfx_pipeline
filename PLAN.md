# Animated Orbital Sphere Graphics Tool — Plan

## What it produces
An animated visualization matching the reference image: a glowing sphere made of
layered orbital rings in multiple colors, rotating slowly on a black background.

## Technology
**Single self-contained HTML file** (HTML5 Canvas + vanilla JS).
- Zero dependencies, opens in any browser
- Easy to tweak parameters via on-screen controls
- Smooth `requestAnimationFrame` animation loop

## How the visuals work
The sphere is built from three overlapping ring systems, each drawn as projected ellipses:

| Layer | Style | Color |
|-------|-------|-------|
| Latitude rings | solid lines | Blue |
| Diagonal spiral rings (tilt ~45°) | solid lines | Green |
| Diagonal spiral rings (tilt ~-45°) | solid lines | Red/Pink |
| Inner Lissajous path | dotted | Yellow-Green |

Each ring is an ellipse whose width/height is determined by its latitude position on
the sphere (cos/sin of the polar angle). All rings share the same center point.

The rings are **fixed in 3D space**. Animation moves the **camera** in a slow elliptical
orbit around the sphere (like a satellite). The viewpoint tilts slightly above/below
the equator over time, giving a gentle rise-and-fall to the orbit path. Perspective
projection makes near rings appear larger and far rings smaller.

## File structure
```
gfx_pipeline/
  orbital_sphere.html   ← the tool (new file)
  mov2gif.py            ← existing, untouched
```

## Controls (sidebar panel)
- **Rings per layer** — slider (10–60)
- **Orbit speed** — slider (camera angular velocity)
- **Orbit tilt** — slider (how far above/below equator camera bobs)
- **Glow intensity** — slider (uses Canvas shadow blur)
- **Color scheme** — dropdown (Neon / Pastel / Monochrome / Custom)
- **Dot layer** — toggle on/off
- **Export frame** — saves current frame as PNG

## Key parameters (code constants, also exposed in UI)
- `RADIUS` — sphere radius in px
- `RING_SETS` — array of `{ count, tilt, color, dash, speed }`
- `BG_COLOR` — background (default #000)
