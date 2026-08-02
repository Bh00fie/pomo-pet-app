/*
 * A tiny software 3D renderer, so these previews show the actual spike rather than a mockup.
 *
 * It re-implements — in ~250 lines against a 2D canvas — the same camera, the same fish
 * geometry and the same swim math as src/features/aquarium3d/. Inlining three.js would have
 * cost ~750 KB per page to draw 1,760 triangles; painter's-algorithm rasterising convex cones
 * costs nothing and is honest about what the scene actually contains.
 *
 * Deliberately NOT a claim about performance. This is a picture of the spike's geometry and
 * motion, running in a browser. The performance numbers live in docs/3D_AQUARIUM_REPORT.md.
 */

const TAU = Math.PI * 2;

/* ---------- geometry ---------- */

// A cone whose axis runs along +X: apex at +h/2, base ring at -h/2. Matches the prototype's
// `<coneGeometry>` rotated into fish-forward space.
function cone(radius, height, segments) {
  const verts = [[height / 2, 0, 0]];
  const base = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * TAU;
    verts.push([-height / 2, Math.cos(t) * radius, Math.sin(t) * radius]);
    base.push(i + 1);
  }
  verts.push([-height / 2, 0, 0]);
  const centre = verts.length - 1;

  const tris = [];
  for (let i = 0; i < segments; i++) {
    const a = base[i];
    const b = base[(i + 1) % segments];
    tris.push([0, a, b]);
    tris.push([centre, b, a]);
  }
  return { verts, tris };
}

function transform(geo, { rotY = 0, rotZ = 0, scale = 1, offset = [0, 0, 0] }) {
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cz = Math.cos(rotZ), sz = Math.sin(rotZ);
  const verts = geo.verts.map(([x, y, z]) => {
    let X = x * scale, Y = y * scale, Z = z * scale;
    [X, Y] = [X * cz - Y * sz, X * sz + Y * cz];
    [X, Z] = [X * cy + Z * sy, -X * sy + Z * cy];
    return [X + offset[0], Y + offset[1], Z + offset[2]];
  });
  return { verts, tris: geo.tris };
}

/* ---------- swim: a direct port of src/features/aquarium3d/swim.ts ---------- */

const GOLDEN = 0.61803398875;

function swimParams(i) {
  const t = (i * GOLDEN) % 1;
  return {
    speed: 0.22 + t * 0.28,
    phase: t * TAU,
    fx: 0.7 + t * 0.5,
    fy: 0.35 + ((i * 2 * GOLDEN) % 1) * 0.4,
    fz: 0.55 + ((i * 3 * GOLDEN) % 1) * 0.6,
    radius: 0.55 + ((i * 5 * GOLDEN) % 1) * 0.4,
  };
}

function unitPath(p, time) {
  const t = time * p.speed + p.phase;
  return [
    Math.sin(t * p.fx) * p.radius,
    Math.sin(t * p.fy + 1.3) * p.radius * 0.7,
    Math.cos(t * p.fz) * p.radius,
  ];
}

// The containment function is the whole tank-shape-as-IAP idea: behaviour is authored once
// against a unit volume, each SKU supplies only this.
function contain(tank, [ux, uy, uz]) {
  const h = tank.half;
  if (tank.shape === 'box') return [ux * h.x, uy * h.y, uz * h.z];
  if (tank.shape === 'cylinder') {
    const k = Math.min(1, 1 / (Math.hypot(ux, uz) || 1));
    return [ux * k * h.x, uy * h.y, uz * k * h.z];
  }
  const k = Math.min(1, 1 / (Math.hypot(ux, uy, uz) || 1));
  return [ux * k * h.x, uy * k * h.y * 0.85, uz * k * h.z];
}

function sampleSwim(tank, p, time) {
  const [x, y, z] = contain(tank, unitPath(p, time));
  const [nx, , nz] = contain(tank, unitPath(p, time + 0.05));
  return { x, y, z, yaw: Math.atan2(-(nz - z), nx - x), beat: (time * p.speed * 9 + p.phase) % TAU };
}

/* ---------- camera ---------- */

const EYE = [0, 0.6, 5.2];
const PITCH = Math.atan2(0.6, 5.2); // look down at the origin

function toView([x, y, z]) {
  const dx = x - EYE[0], dy = y - EYE[1], dz = z - EYE[2];
  const c = Math.cos(PITCH), s = Math.sin(PITCH);
  return [dx, dy * c - dz * s, dy * s + dz * c];
}

/* ---------- shading ---------- */

const LIGHT = (() => {
  const [x, y, z] = [2, 4, 3];
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();

function shade(hex, a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  // abs(): faces are not consistently wound and the shapes are convex, so two-sided lighting
  // is both cheaper and better-looking than trying to cull.
  const diffuse = Math.abs(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  const fill = Math.max(0, -ny) * 0.18; // cool bounce off the substrate
  const k = 0.46 + diffuse * 0.62;
  const r = Math.min(255, hex[0] * k + 70 * fill);
  const g = Math.min(255, hex[1] * k + 100 * fill);
  const bl = Math.min(255, hex[2] * k + 140 * fill);
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------- silhouette (the glass outline) ---------- */

function hull(points) {
  const pts = points.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (src) => {
    const out = [];
    for (const p of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return build(pts).concat(build(pts.reverse()));
}

function silhouettePoints(tank) {
  const h = tank.half;
  const pts = [];
  if (tank.shape === 'box') {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
      pts.push([sx * h.x, sy * h.y, sz * h.z]);
  } else if (tank.shape === 'cylinder') {
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * TAU;
      pts.push([Math.cos(t) * h.x, h.y, Math.sin(t) * h.z]);
      pts.push([Math.cos(t) * h.x, -h.y, Math.sin(t) * h.z]);
    }
  } else {
    for (let i = 0; i < 24; i++) for (let j = 0; j <= 12; j++) {
      const u = (i / 24) * TAU, v = 0.5 + (j / 12) * (Math.PI - 0.5);
      pts.push([
        Math.sin(v) * Math.cos(u) * h.x,
        Math.cos(v) * h.y,
        Math.sin(v) * Math.sin(u) * h.z,
      ]);
    }
  }
  return pts;
}

const BOX_EDGES = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
  [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
];

/* ---------- scene ---------- */

const PALETTE = [
  ['#FF8A65', '#FFD166'], ['#4FD1A5', '#2E8B74'], ['#5B9BD5', '#F2A65A'],
  ['#FFD166', '#E5A50A'], ['#C08BE0', '#7E5AA2'],
];

export function createTankScene(canvas, tank, options = {}) {
  const ctx = canvas.getContext('2d');
  const state = { fishCount: options.fishCount ?? 12, running: true, tank };

  // Static per-fish geometry, built once. The tail is kept separate so it can be hinged.
  const BODY = cone(0.09, 0.32, 7);
  // Spans x = -0.30 (tip) to x = -0.16, so its base sits exactly on the body's tail hinge.
  const TAIL = transform(cone(0.09, 0.14, 4), { rotY: Math.PI, offset: [-0.23, 0, 0] });
  const HINGE_X = -0.16;
  const DORSAL = transform(cone(0.05, 0.09, 3), { rotZ: Math.PI / 2, offset: [-0.02, 0.085, 0] });

  let sil = null, corners = null, rim = null, w = 0, h = 0, cx = 0, cy = 0, scale = 1;
  // A uniform 2D fit applied after projection, so each tank is framed to its card without
  // changing the camera. Perspective is untouched — this only zooms and centres the result.
  let fit = { s: 1, dx: 0, dy: 0 };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = w / 2;
    cy = h / 2;
    scale = (h / 2) / Math.tan((42 * Math.PI) / 360);
    sil = null;
  }

  function projectRaw(p) {
    const v = toView(p);
    const d = -v[2];
    if (d <= 0.05) return null;
    return [cx + (v[0] * scale) / d, cy - (v[1] * scale) / d, v[2]];
  }

  function project(p) {
    const r = projectRaw(p);
    if (!r) return null;
    return [(r[0] - cx) * fit.s + cx + fit.dx, (r[1] - cy) * fit.s + cy + fit.dy, r[2]];
  }

  function ensureStatic() {
    if (sil) return;

    const raw = silhouettePoints(state.tank).map(projectRaw).filter(Boolean);
    const xs = raw.map((p) => p[0]);
    const ys = raw.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    const pad = Math.min(w, h) * 0.09;
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const my = (Math.min(...ys) + Math.max(...ys)) / 2;
    fit.s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    fit.dx = -(mx - cx) * fit.s;
    fit.dy = -(my - cy) * fit.s;

    sil = hull(silhouettePoints(state.tank).map(project).filter(Boolean).map((p) => [p[0], p[1]]));

    const hh = state.tank.half;
    corners = null;
    rim = null;

    if (state.tank.shape === 'box') {
      corners = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
        corners.push(project([sx * hh.x, sy * hh.y, sz * hh.z]));
    } else {
      // The open top. Without it a bowl silhouettes as a solid ball and a column as a capsule.
      // The bowl's rim follows the sphere's thetaStart of 0.5 rad, matching Tank.tsx.
      const ry = state.tank.shape === 'bowl' ? Math.cos(0.5) * hh.y : hh.y;
      const rr = state.tank.shape === 'bowl' ? Math.sin(0.5) : 1;
      rim = [];
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * TAU;
        const p = project([Math.cos(t) * hh.x * rr, ry, Math.sin(t) * hh.z * rr]);
        if (p) rim.push(p);
      }
    }
  }

  function tracePath(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
  }

  function drawWater() {
    tracePath(sil);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(79,155,213,0.20)');
    g.addColorStop(1, 'rgba(8,32,52,0.42)');
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawGlass() {
    if (corners) {
      ctx.strokeStyle = 'rgba(159,216,240,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [a, b] of BOX_EDGES) {
        if (!corners[a] || !corners[b]) continue;
        ctx.moveTo(corners[a][0], corners[a][1]);
        ctx.lineTo(corners[b][0], corners[b][1]);
      }
      ctx.stroke();
    }
    if (rim) {
      ctx.beginPath();
      ctx.moveTo(rim[0][0], rim[0][1]);
      for (let i = 1; i < rim.length; i++) ctx.lineTo(rim[i][0], rim[i][1]);
      ctx.strokeStyle = 'rgba(180,230,250,0.42)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    tracePath(sil);
    ctx.strokeStyle = 'rgba(180,230,250,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Everything drawn between the water and the glass goes through one depth-sorted list, so
  // fish correctly pass in front of and behind the coral.
  function collect(time) {
    const tris = [];

    const push = (geo, colour, xform) => {
      const verts = geo.verts.map(xform);
      const base = rgb(colour);
      for (const [i, j, k] of geo.tris) {
        const a = verts[i], b = verts[j], c = verts[k];
        const pa = project(a), pb = project(b), pc = project(c);
        if (!pa || !pb || !pc) continue;
        tris.push({ z: (pa[2] + pb[2] + pc[2]) / 3, pa, pb, pc, fill: shade(base, a, b, c) });
      }
    };

    const hh = state.tank.half;
    // Curved tanks have no flat floor at -half.y, so decor has to sit higher and closer in or
    // it pokes out through the glass.
    const curved = state.tank.shape !== 'box';
    const floor = curved ? -hh.y * 0.66 : -hh.y + 0.02;
    const spread = hh.x * (curved ? 0.42 : 0.6);

    // rocks — squat cones stood on end, which at this scale reads as rubble
    for (const i of [-1, 0, 1]) {
      const r = 0.11 + Math.abs(i) * 0.04;
      const g = transform(cone(r, r * 1.6, 6), { rotZ: Math.PI / 2 });
      push(g, '#2A4A5E', ([x, y, z]) => [
        i * spread * 0.7 + x,
        floor + r * 0.8 + y,
        -hh.z * 0.3 + z,
      ]);
    }

    // branching coral
    for (let i = 0; i < 3; i++) {
      const g = transform(cone(0.045, 0.24 + i * 0.08, 5), { rotZ: Math.PI / 2 + (i - 1) * 0.25 });
      push(g, '#E0715C', ([x, y, z]) => [
        -spread + i * 0.07 - 0.07 + x,
        floor + 0.16 + i * 0.06 + y,
        hh.z * 0.25 + z,
      ]);
    }

    for (let i = 0; i < state.fishCount; i++) {
      const [colour, accent] = PALETTE[i % PALETTE.length];
      const s = sampleSwim(state.tank, swimParams(i), time);
      const size = 0.8 + ((i * 7) % 5) * 0.12;
      const roll = Math.sin(s.beat) * 0.08;
      const cyw = Math.cos(s.yaw), syw = Math.sin(s.yaw);
      const cr = Math.cos(roll), sr = Math.sin(roll);

      const place = ([x, y, z]) => {
        let X = x * size, Y = y * size, Z = z * size;
        [X, Y] = [X * cr - Y * sr, X * sr + Y * cr];
        [X, Z] = [X * cyw + Z * syw, -X * syw + Z * cyw];
        return [X + s.x, Y + s.y, Z + s.z];
      };

      push(BODY, colour, place);
      push(DORSAL, accent, place);

      // Tail hinges at the back of the body, so the wag reads as a beat rather than a slide.
      const wag = Math.sin(s.beat) * 0.5;
      const cw = Math.cos(wag), sw = Math.sin(wag);
      push(TAIL, accent, ([x, y, z]) => {
        const lx = x - HINGE_X;
        return place([lx * cw + z * sw + HINGE_X, y, -lx * sw + z * cw]);
      });
    }

    tris.sort((a, b) => a.z - b.z);
    return tris;
  }

  function frame(time) {
    ensureStatic();
    ctx.clearRect(0, 0, w, h);
    drawWater();

    for (const t of collect(time)) {
      ctx.beginPath();
      ctx.moveTo(t.pa[0], t.pa[1]);
      ctx.lineTo(t.pb[0], t.pb[1]);
      ctx.lineTo(t.pc[0], t.pc[1]);
      ctx.closePath();
      ctx.fillStyle = t.fill;
      ctx.fill();
    }

    drawGlass();
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let raf = 0;
  const start = performance.now();

  function loop(now) {
    if (!state.running) return;
    frame((now - start) / 1000);
    raf = requestAnimationFrame(loop);
  }

  const ro = new ResizeObserver(() => { resize(); if (!state.running) frame(2.4); });
  ro.observe(canvas);
  resize();

  if (reduced.matches) {
    state.running = false;
    frame(2.4); // a representative still, rather than nothing
  } else {
    raf = requestAnimationFrame(loop);
  }

  return {
    setFishCount(n) { state.fishCount = n; if (!state.running) frame(2.4); },
    setTank(t) { state.tank = t; sil = null; if (!state.running) frame(2.4); },
    destroy() { state.running = false; cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

export const TANKS = {
  rectangular: { id: 'rectangular', shape: 'box', half: { x: 2.2, y: 1.3, z: 1.2 } },
  bowl: { id: 'bowl', shape: 'bowl', half: { x: 1.5, y: 1.5, z: 1.5 } },
  column: { id: 'column', shape: 'cylinder', half: { x: 1.0, y: 1.9, z: 1.0 } },
};
