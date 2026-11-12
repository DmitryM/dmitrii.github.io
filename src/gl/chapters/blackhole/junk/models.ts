/**
 * The things a visitor can throw into the black hole, built procedurally in a "designer toy"
 * style: chunky rounded shapes, clean saturated colours, a few glowing details. No assets.
 *
 * Every model is a single merged, non-indexed geometry with
 *   color   albedo (linear)
 *   aMat    x emissive strength, y gloss, z peel bias (parts that are stripped first), w kind
 *   aDecal  xy UV in the shared decal atlas, z = 1 where a decal applies
 * and is centred and scaled to BODY_RADIUS. Pure geometry: runs in Node (tests) as well.
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mulberry32 } from '../../../../physics/hydrogen.ts';
import type { JunkId } from '../../../../i18n/index.ts';

/** Bounding radius of every model, in r_s (≈ 3 r_s across, about the size of the shadow). */
export const BODY_RADIUS = 1.5;

/** Material kinds (aMat.w) with special shading. */
export const KIND = { plain: 0, leg: 1, flame: 2, blink: 3, glass: 4, screen: 5 } as const;

/** Decal atlas: a 1024² canvas; cells are [x, y, w, h] in pixels from the top-left corner. */
export const ATLAS_SIZE = 1024;
export const DECALS = {
  bsod: [0, 0, 512, 384],
  nodeModules: [512, 0, 512, 256],
  sideUp: [512, 256, 256, 128],
  usb: [768, 256, 128, 128],
  paper: [896, 256, 128, 128],
  fri: [0, 384, 384, 320],
  friHeader: [384, 384, 384, 96],
  pager: [384, 480, 384, 128],
  floppy: [768, 384, 256, 192],
  terminal: [384, 608, 384, 256],
  keys: [768, 576, 256, 192],
  todo: [0, 704, 384, 320],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type DecalName = keyof typeof DECALS;

interface PartOptions {
  emit?: number;
  gloss?: number;
  peel?: number;
  kind?: number;
  decal?: DecalName;
}

/** Bakes colour, material and decal attributes into a primitive (drops its UVs). */
function part(source: BufferGeometry, color: number, o: PartOptions = {}): BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source;
  const n = g.getAttribute('position').count;
  const c = new Color(color);
  const col = new Float32Array(n * 3);
  const mat = new Float32Array(n * 4);
  const dec = new Float32Array(n * 3);
  const uv = g.getAttribute('uv');
  const rect = o.decal ? DECALS[o.decal] : null;
  for (let i = 0; i < n; i++) {
    col.set([c.r, c.g, c.b], i * 3);
    mat.set([o.emit ?? 0, o.gloss ?? 0.5, o.peel ?? 0, o.kind ?? 0], i * 4);
    if (rect && uv) {
      const [x, y, w, h] = rect;
      dec[i * 3] = (x + uv.getX(i) * w) / ATLAS_SIZE;
      dec[i * 3 + 1] = 1 - (y + (1 - uv.getY(i)) * h) / ATLAS_SIZE;
      dec[i * 3 + 2] = 1;
    }
  }
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setAttribute('aMat', new Float32BufferAttribute(mat, 4));
  g.setAttribute('aDecal', new Float32BufferAttribute(dec, 3));
  return g;
}

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
/** Scale, then rotate (XYZ Euler), then translate a geometry in place. */
function at<T extends BufferGeometry>(g: T, p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0], s: number | [number, number, number] = 1): T {
  const sv = typeof s === 'number' ? new Vector3(s, s, s) : new Vector3(...s);
  g.applyMatrix4(m4.compose(new Vector3(...p), q.setFromEuler(e.set(...r)), sv));
  return g;
}

const rbox = (w: number, h: number, d: number, r = 0.08, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const sphere = (r: number, ws = 28, hs = 18) => new SphereGeometry(r, ws, hs);
const cyl = (rt: number, rb: number, h: number, seg = 28) => new CylinderGeometry(rt, rb, h, seg);
const plane = (w: number, h: number, sx = 1, sy = 1) => new PlaneGeometry(w, h, sx, sy);
const lathe = (pts: [number, number][], seg = 40) => new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg);
const tube = (pts: [number, number, number][], r: number, seg = 40, radial = 6) => new TubeGeometry(new CatmullRomCurve3(pts.map((p) => new Vector3(...p))), seg, r, radial, false);

// ── the catalogue ────────────────────────────────────────────────────────────────────────────

function pc(): BufferGeometry[] {
  const beige = 0xdcd1b3;
  const lid: [number, number, number] = [0, 0.38, 0.32];
  return [
    part(at(rbox(2.5, 0.55, 2.0, 0.07), [0, -0.78, 0]), 0xd2c6a6, { gloss: 0.35 }),
    part(at(rbox(0.75, 0.06, 0.04, 0.02), [0.55, -0.74, 1.0]), 0x2a2722, { gloss: 0.3 }),
    part(at(sphere(0.05, 10, 8), [-0.95, -0.76, 1.0]), 0x5dff7a, { emit: 4, kind: KIND.blink }),
    part(at(rbox(2.05, 1.62, 0.38, 0.12), lid), beige, { gloss: 0.4 }),
    // the tube's tapered back: a square frustum
    part(at(new CylinderGeometry(0.5, 0.86, 1.0, 4, 1, false, Math.PI / 4), [0, 0.38, -0.36], [-Math.PI / 2, 0, 0], [1.0, 1, 0.82]), 0xcdc1a0, { gloss: 0.3 }),
    part(at(plane(1.58, 1.18), [0, 0.4, 0.515]), 0x2a5fe0, { emit: 2.4, kind: KIND.screen, decal: 'bsod', peel: 0.15 }),
    part(at(rbox(0.5, 0.08, 0.06, 0.02), [0.7, -0.38, 0.52]), 0xbdb193, { gloss: 0.3 }),
  ];
}

function mug(): BufferGeometry[] {
  return [
    part(
      lathe([
        [0, -0.9],
        [0.68, -0.9],
        [0.8, -0.8],
        [0.84, 0.82],
        [0.79, 0.9],
        [0.72, 0.86],
        [0.7, -0.72],
        [0, -0.72],
      ]),
      0xf05a3c,
      { gloss: 0.8 },
    ),
    part(at(cyl(0.705, 0.705, 0.02, 40), [0, 0.6, 0]), 0x3a1d0e, { gloss: 0.95, peel: 0.75 }),
    part(at(new TorusGeometry(0.4, 0.11, 12, 28, Math.PI), [0.8, 0.02, 0], [0, 0, -Math.PI / 2]), 0xf05a3c, { gloss: 0.8 }),
    part(at(rbox(0.06, 0.5, 0.36, 0.03), [0.84, 0.05, 0], [0, 0, -0.03]), 0xfff4e6, { gloss: 0.5 }),
  ];
}

function duck(): BufferGeometry[] {
  const yellow = 0xffcd2e;
  return [
    part(at(sphere(1, 32, 20), [0, -0.25, 0], [0, 0, 0], [1.25, 0.82, 1.0]), yellow, { gloss: 0.75 }),
    part(at(new ConeGeometry(0.36, 0.7, 20), [-1.12, 0.12, 0], [0, 0, 0.85]), yellow, { gloss: 0.75 }),
    part(at(sphere(0.62), [0.62, 0.62, 0]), yellow, { gloss: 0.75 }),
    part(at(sphere(0.32), [1.2, 0.5, 0], [0, 0, -0.1], [1.45, 0.42, 1.0]), 0xff7a1a, { gloss: 0.6 }),
    part(at(sphere(0.095, 14, 10), [0.98, 0.84, 0.33]), 0x111111, { gloss: 1 }),
    part(at(sphere(0.095, 14, 10), [0.98, 0.84, -0.33]), 0x111111, { gloss: 1 }),
    part(at(sphere(0.6), [-0.15, -0.1, 0.78], [0, 0, 0.2], [0.95, 0.42, 0.22]), 0xffb61f, { gloss: 0.7 }),
    part(at(sphere(0.6), [-0.15, -0.1, -0.78], [0, 0, 0.2], [0.95, 0.42, 0.22]), 0xffb61f, { gloss: 0.7 }),
  ];
}

function printer(): BufferGeometry[] {
  return [
    part(rbox(2.4, 0.9, 1.7, 0.14), 0xd7dae0, { gloss: 0.45 }),
    part(at(rbox(2.15, 0.08, 1.35, 0.03), [0, 0.48, -0.05]), 0x9aa1ad, { gloss: 0.5 }),
    part(at(rbox(1.7, 0.05, 0.85, 0.02), [0, 0.78, -0.82], [-0.65, 0, 0]), 0x8b929e, { gloss: 0.4 }),
    part(at(rbox(1.5, 0.025, 0.85, 0.01), [0, 0.84, -0.8], [-0.65, 0, 0]), 0xf7f6f0, { gloss: 0.2, peel: 0.55 }),
    part(at(rbox(1.75, 0.1, 0.06, 0.03), [0, 0.02, 0.86]), 0x2a2e35, { gloss: 0.3 }),
    part(at(plane(1.5, 0.95), [0, 0.0, 1.32], [-Math.PI / 2 + 0.18, 0, 0]), 0xf7f6f0, { gloss: 0.2, peel: 0.85, decal: 'paper' }),
    part(at(rbox(0.5, 0.22, 0.05, 0.03), [0.78, 0.26, 0.86]), 0x22262d, { gloss: 0.6 }),
    part(at(sphere(0.055, 10, 8), [0.36, 0.26, 0.87]), 0x45ff7a, { emit: 3 }),
    part(at(sphere(0.055, 10, 8), [0.48, 0.26, 0.87]), 0xff8a1a, { emit: 4, kind: KIND.blink }),
  ];
}

function bug(): BufferGeometry[] {
  const shell = 0x1f9a63;
  const dark = 0x0f2219;
  const out: BufferGeometry[] = [
    // split wing cases
    part(at(new SphereGeometry(1, 28, 14, 0, Math.PI, 0, Math.PI / 2), [0, 0, 0.03], [0.07, 0, 0], [1.25, 0.72, 0.92]), shell, { gloss: 1 }),
    part(at(new SphereGeometry(1, 28, 14, Math.PI, Math.PI, 0, Math.PI / 2), [0, 0, -0.03], [-0.07, 0, 0], [1.25, 0.72, 0.92]), shell, { gloss: 1 }),
    part(at(sphere(1, 24, 12), [0, 0, 0], [0, 0, 0], [1.2, 0.22, 0.86]), dark, { gloss: 0.5 }),
    part(at(sphere(0.42), [1.28, 0.05, 0], [0, 0, 0], [1, 0.85, 1]), dark, { gloss: 0.9 }),
    part(at(sphere(0.1, 12, 8), [1.55, 0.2, 0.2]), 0xfafafa, { gloss: 1, emit: 0.2 }),
    part(at(sphere(0.1, 12, 8), [1.55, 0.2, -0.2]), 0xfafafa, { gloss: 1, emit: 0.2 }),
  ];
  for (const s of [1, -1]) {
    out.push(
      part(
        tube(
          [
            [1.5, 0.25, 0.12 * s],
            [1.85, 0.62, 0.36 * s],
            [2.05, 0.7, 0.62 * s],
          ],
          0.03,
          14,
          5,
        ),
        dark,
        { gloss: 0.6 },
      ),
    );
    for (let i = 0; i < 3; i++) {
      const x = -0.55 + 0.55 * i;
      out.push(
        part(
          tube(
            [
              [x, 0, 0.7 * s],
              [x + 0.12, 0.28, 1.12 * s],
              [x + 0.3, -0.42, 1.42 * s],
            ],
            0.045,
            14,
            5,
          ),
          dark,
          { gloss: 0.6, kind: KIND.leg },
        ),
      );
    }
  }
  return out;
}

function spaghetti(): BufferGeometry[] {
  const rand = mulberry32(42);
  const out: BufferGeometry[] = [
    part(
      lathe([
        [0, -0.62],
        [0.7, -0.62],
        [1.05, -0.32],
        [1.26, 0.22],
        [1.2, 0.28],
        [1.0, -0.2],
        [0.62, -0.46],
        [0, -0.46],
      ]),
      0xf3f4f7,
      { gloss: 0.85 },
    ),
    part(at(new TorusGeometry(1.235, 0.045, 8, 56), [0, 0.24, 0], [Math.PI / 2, 0, 0]), 0x2c62d8, { gloss: 0.8 }),
  ];
  const noodle = 0xf2cd68;
  for (let i = 0; i < 16; i++) {
    const pts: [number, number, number][] = [];
    const a0 = rand() * Math.PI * 2;
    for (let k = 0; k < 6; k++) {
      const a = a0 + k * (0.9 + rand() * 0.6);
      const rr = 0.25 + rand() * 0.7;
      pts.push([Math.cos(a) * rr, 0.12 + 0.5 * (1 - rr * rr) + rand() * 0.12, Math.sin(a) * rr]);
    }
    out.push(part(tube(pts, 0.045, 48, 5), noodle, { gloss: 0.55, peel: 0.7 }));
  }
  // a few strands dangle over the rim
  for (let i = 0; i < 3; i++) {
    const a = 0.6 + i * 2.1;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push(
      part(
        tube(
          [
            [c * 0.5, 0.5, s * 0.5],
            [c * 1.12, 0.42, s * 1.12],
            [c * 1.38, 0.05, s * 1.38],
            [c * 1.34, -0.42, s * 1.34],
          ],
          0.045,
          32,
          5,
        ),
        noodle,
        { gloss: 0.55, peel: 0.8 },
      ),
    );
  }
  out.push(part(at(sphere(0.5), [0, 0.66, 0], [0, 0, 0], [1.0, 0.26, 1.0]), 0xc8321e, { gloss: 0.85, peel: 0.3 }));
  out.push(part(at(sphere(0.32), [0.08, 0.84, 0.06]), 0x6e3420, { gloss: 0.3 }));
  out.push(part(at(sphere(0.2, 12, 8), [-0.18, 0.98, 0.18], [0.3, 0.4, 0], [1, 0.18, 0.55]), 0x2f9e44, { gloss: 0.6, peel: 0.5 }));
  return out;
}

function floppy(): BufferGeometry[] {
  return [
    part(rbox(2.0, 2.0, 0.16, 0.06), 0x2846a0, { gloss: 0.55 }),
    part(at(rbox(0.95, 0.76, 0.2, 0.02), [0.12, 0.6, 0]), 0xc6ccd5, { gloss: 1 }),
    part(at(rbox(0.25, 0.5, 0.22, 0.02), [0.34, 0.6, 0]), 0x252a35, { gloss: 0.4 }),
    part(at(rbox(0.16, 0.16, 0.18, 0.02), [-0.85, -0.86, 0]), 0x18213f, { gloss: 0.4 }),
    part(at(plane(1.62, 1.02), [0, -0.38, 0.085]), 0xf6f2e8, { gloss: 0.2, decal: 'floppy', peel: 0.4 }),
  ];
}

function pager(): BufferGeometry[] {
  return [
    part(rbox(1.9, 1.1, 0.5, 0.2), 0x1d1f25, { gloss: 0.6 }),
    part(at(rbox(1.45, 0.62, 0.04, 0.03), [-0.1, 0.12, 0.24]), 0x30343d, { gloss: 0.5 }),
    part(at(plane(1.3, 0.48), [-0.1, 0.12, 0.262]), 0x9bd36b, { emit: 1.5, decal: 'pager', kind: KIND.screen }),
    part(at(rbox(0.24, 0.13, 0.08, 0.04), [-0.55, -0.33, 0.25]), 0x5a616d, { gloss: 0.5 }),
    part(at(rbox(0.24, 0.13, 0.08, 0.04), [-0.15, -0.33, 0.25]), 0x5a616d, { gloss: 0.5 }),
    part(at(rbox(0.24, 0.13, 0.08, 0.04), [0.25, -0.33, 0.25]), 0x5a616d, { gloss: 0.5 }),
    part(at(sphere(0.075, 12, 8), [0.78, 0.36, 0.24]), 0xff2a2a, { emit: 5, kind: KIND.blink }),
    part(at(rbox(0.5, 0.82, 0.08, 0.03), [0, 0, -0.29]), 0x2a2d34, { gloss: 0.5 }),
  ];
}

function nodeModules(): BufferGeometry[] {
  const card = 0xc39257;
  return [
    part(rbox(2.2, 1.7, 1.7, 0.04, 2), card, { gloss: 0.15 }),
    part(at(rbox(0.5, 0.03, 1.72, 0.012, 1), [0, 0.855, 0]), 0xe2c690, { gloss: 0.75 }),
    part(at(rbox(0.5, 0.42, 0.03, 0.012, 1), [0, 0.65, 0.856]), 0xe2c690, { gloss: 0.75 }),
    part(at(plane(1.9, 0.95), [0, -0.2, 0.853]), card, { gloss: 0.15, decal: 'nodeModules' }),
    part(at(plane(1.2, 0.6), [1.103, 0.1, 0], [0, Math.PI / 2, 0]), card, { gloss: 0.15, decal: 'sideUp' }),
  ];
}

function calendar(): BufferGeometry[] {
  return [
    part(at(rbox(1.7, 1.9, 0.4, 0.06), [0, -0.1, 0]), 0xf3f1ec, { gloss: 0.25 }),
    part(at(rbox(1.74, 0.52, 0.44, 0.07), [0, 0.76, 0]), 0xd8342c, { gloss: 0.5 }),
    part(at(plane(1.5, 0.375), [0, 0.76, 0.222]), 0xd8342c, { gloss: 0.5, decal: 'friHeader' }),
    part(at(plane(1.55, 1.3), [0, -0.27, 0.202]), 0xf3f1ec, { gloss: 0.25, decal: 'fri', peel: 0.5 }),
    part(at(new TorusGeometry(0.12, 0.03, 8, 20), [0.45, 1.04, 0], [0, Math.PI / 2, 0]), 0xb9bfc9, { gloss: 1 }),
    part(at(new TorusGeometry(0.12, 0.03, 8, 20), [-0.45, 1.04, 0], [0, Math.PI / 2, 0]), 0xb9bfc9, { gloss: 1 }),
  ];
}

function sticky(): BufferGeometry[] {
  // the top sheet curls up at its bottom-right corner
  const sheet = plane(1.8, 1.8, 14, 14);
  const p = sheet.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / 1.8 + 0.5;
    const v = p.getY(i) / 1.8 + 0.5;
    const d = Math.max(0, u - v - 0.4);
    p.setZ(i, d * d * 1.6);
    p.setX(i, p.getX(i) - d * d * 0.35);
    p.setY(i, p.getY(i) + d * d * 0.35);
  }
  sheet.computeVertexNormals();
  return [
    part(at(rbox(1.8, 1.8, 0.14, 0.02, 2), [0, 0, -0.08]), 0xffd83a, { gloss: 0.2 }),
    part(at(sheet, [0, 0, 0.0]), 0xffe45c, { gloss: 0.25, decal: 'todo', peel: 0.3 }),
  ];
}

function laptop(): BufferGeometry[] {
  const metal = 0x6d727c;
  const lidTilt = -0.28;
  const lid = (g: BufferGeometry, z: number) => at(at(at(g, [0, 0.78, z]), [0, 0, 0], [lidTilt, 0, 0]), [0, -0.44, -0.78]);
  const out: BufferGeometry[] = [
    part(at(rbox(2.4, 0.12, 1.6, 0.05), [0, -0.5, 0]), metal, { gloss: 0.85 }),
    part(at(plane(2.0, 0.85), [0, -0.437, -0.12], [-Math.PI / 2, 0, 0]), 0x1f2228, { gloss: 0.4, decal: 'keys' }),
    part(at(plane(0.72, 0.4), [0, -0.437, 0.5], [-Math.PI / 2, 0, 0]), 0x7c818b, { gloss: 0.9 }),
    part(lid(rbox(2.4, 1.56, 0.08, 0.05), 0), metal, { gloss: 0.85 }),
    part(lid(plane(2.18, 1.36), 0.042), 0x0d1015, { emit: 1.8, decal: 'terminal', kind: KIND.screen }),
  ];
  // it is on fire
  const flames: [number, number, number][] = [
    [-0.6, -0.1, 0.05],
    [-0.15, -0.1, -0.25],
    [0.35, -0.1, 0.1],
    [0.75, -0.1, -0.2],
    [0.1, -0.1, 0.35],
  ];
  flames.forEach(([x, , z], i) => {
    const h = 0.75 + (i % 3) * 0.18;
    out.push(part(at(new ConeGeometry(0.2, h, 14), [x, -0.43 + h / 2, z]), 0xff6a14, { emit: 3.2, kind: KIND.flame, peel: 0.9 }));
    out.push(part(at(new ConeGeometry(0.11, h * 0.62, 12), [x, -0.43 + h * 0.31 + 0.02, z + 0.04]), 0xffd84a, { emit: 5, kind: KIND.flame, peel: 0.95 }));
  });
  return out;
}

function hourglass(): BufferGeometry[] {
  const wood = 0x8f5a32;
  const sand = 0xe9b95e;
  const out: BufferGeometry[] = [
    part(at(cyl(0.86, 0.86, 0.16, 32), [0, 1.06, 0]), wood, { gloss: 0.55 }),
    part(at(cyl(0.86, 0.86, 0.16, 32), [0, -1.06, 0]), wood, { gloss: 0.55 }),
  ];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    out.push(part(at(cyl(0.055, 0.055, 1.98, 10), [Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72]), 0x6e4223, { gloss: 0.5 }));
  }
  out.push(part(at(new ConeGeometry(0.5, 0.42, 28), [0, -0.76, 0]), sand, { gloss: 0.15, peel: 0.35 }));
  out.push(part(at(new ConeGeometry(0.4, 0.36, 28), [0, 0.42, 0], [Math.PI, 0, 0]), sand, { gloss: 0.15, peel: 0.35 }));
  out.push(part(at(cyl(0.022, 0.022, 0.62, 6), [0, -0.27, 0]), sand, { gloss: 0.15, peel: 0.35 }));
  // glass last: drawn over the sand
  out.push(
    part(
      lathe(
        [
          [0.02, -0.98],
          [0.56, -0.93],
          [0.63, -0.6],
          [0.46, -0.25],
          [0.09, -0.03],
          [0.09, 0.03],
          [0.46, 0.25],
          [0.63, 0.6],
          [0.56, 0.93],
          [0.02, 0.98],
        ],
        36,
      ),
      0xd8eeff,
      { gloss: 1, kind: KIND.glass },
    ),
  );
  return out;
}

function usb(): BufferGeometry[] {
  const coil: [number, number, number][] = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const a = t * Math.PI * 2 * 2.2;
    const rr = 0.42 * Math.min(1, t * 4);
    coil.push([Math.sin(a) * rr, (Math.cos(a) - 1) * rr * 0.9, -1.12 - t * 1.25]);
  }
  return [
    part(rbox(0.78, 0.44, 1.3, 0.12), 0x1e2027, { gloss: 0.55 }),
    part(at(plane(0.42, 0.42), [0, 0.222, -0.15], [-Math.PI / 2, 0, 0]), 0x1e2027, { gloss: 0.55, decal: 'usb' }),
    part(at(rbox(0.64, 0.25, 0.8, 0.02), [0, 0, 1.02]), 0xcfd4dc, { gloss: 1 }),
    part(at(rbox(0.52, 0.07, 0.66, 0.02), [0, -0.045, 1.07]), 0x2f6bff, { gloss: 0.7 }),
    part(at(rbox(0.11, 0.03, 0.11, 0.01), [0.14, 0.125, 1.2]), 0x15171c, { gloss: 0.3 }),
    part(at(rbox(0.11, 0.03, 0.11, 0.01), [-0.14, 0.125, 1.2]), 0x15171c, { gloss: 0.3 }),
    part(at(cyl(0.15, 0.2, 0.4, 16), [0, 0, -0.84], [Math.PI / 2, 0, 0]), 0x1e2027, { gloss: 0.5 }),
    part(tube(coil, 0.075, 140, 8), 0x23252c, { gloss: 0.6, peel: 0.3 }),
  ];
}

const BUILDERS: Record<JunkId, () => BufferGeometry[]> = {
  pc,
  mug,
  duck,
  printer,
  bug,
  spaghetti,
  floppy,
  pager,
  nodeModules,
  calendar,
  sticky,
  laptop,
  hourglass,
  usb,
};

/** node_modules is famously heavy: it falls faster and flares harder. */
export const MASS: Partial<Record<JunkId, number>> = { nodeModules: 3 };

const cache = new Map<JunkId, BufferGeometry>();

/** Merged, centred geometry of a model scaled to BODY_RADIUS (cached). */
export function modelGeometry(id: JunkId): BufferGeometry {
  let g = cache.get(id);
  if (g) return g;
  g = mergeGeometries(BUILDERS[id]());
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  const s = BODY_RADIUS / g.boundingSphere!.radius;
  g.scale(s, s, s);
  g.computeBoundingSphere();
  cache.set(id, g);
  return g;
}

/** Surface points of a model, area-weighted, with the attributes the debris needs. */
export interface SurfaceSamples {
  count: number;
  /** local position, xyz */
  position: Float32Array;
  /** local normal, xyz */
  normal: Float32Array;
  /** albedo, rgb (linear) */
  color: Float32Array;
  /** x peel bias, y emissive */
  mat: Float32Array;
}

const sampleCache = new Map<string, SurfaceSamples>();

export function surfaceSamples(id: JunkId, count: number): SurfaceSamples {
  const key = `${id}:${count}`;
  let s = sampleCache.get(key);
  if (s) return s;
  const g = modelGeometry(id);
  // the sampler interpolates a 'uv' attribute: borrow it to carry (peel, emissive) per face
  const sg = new BufferGeometry();
  sg.setAttribute('position', g.getAttribute('position'));
  sg.setAttribute('normal', g.getAttribute('normal'));
  sg.setAttribute('color', g.getAttribute('color'));
  const mat = g.getAttribute('aMat');
  const pe = new Float32Array(mat.count * 2);
  for (let i = 0; i < mat.count; i++) {
    pe[i * 2] = mat.getZ(i);
    pe[i * 2 + 1] = mat.getW(i) === KIND.glass ? 0 : mat.getX(i);
  }
  sg.setAttribute('uv', new Float32BufferAttribute(pe, 2));
  const sampler = new MeshSurfaceSampler(new Mesh(sg));
  (sampler as unknown as { setRandomGenerator(f: () => number): void }).setRandomGenerator(mulberry32(count * 31 + id.length));
  sampler.build();
  s = { count, position: new Float32Array(count * 3), normal: new Float32Array(count * 3), color: new Float32Array(count * 3), mat: new Float32Array(count * 2) };
  const p = new Vector3();
  const n = new Vector3();
  const c = new Color();
  const uv = new Vector2();
  for (let i = 0; i < count; i++) {
    sampler.sample(p, n, c, uv);
    s.position.set([p.x, p.y, p.z], i * 3);
    s.normal.set([n.x, n.y, n.z], i * 3);
    s.color.set([c.r, c.g, c.b], i * 3);
    s.mat.set([uv.x, uv.y], i * 2);
  }
  sampleCache.set(key, s);
  return s;
}

/**
 * Smooth pseudo-random field used to shape the dissolve front. Evaluated identically here (for
 * debris release) and in junk.frag (for the surface), so particles leave exactly where it burns.
 */
export function wobble(x: number, y: number, z: number): number {
  return (Math.sin(x * 4.1 + Math.sin(y * 3.3)) + Math.sin(y * 4.7 + Math.sin(z * 3.9)) + Math.sin(z * 4.3 + Math.sin(x * 3.1))) / 6 + 0.5;
}

/**
 * Dissolve threshold of a surface point (local coordinates): the side facing the hole goes first,
 * shaped by the wobble field; `peel` strips loose parts (coffee, paper, flames) early.
 */
export function dissolveThreshold(x: number, y: number, z: number, peelDir: Vector3, peel: number): number {
  const g = 0.5 - (0.5 * (x * peelDir.x + y * peelDir.y + z * peelDir.z)) / BODY_RADIUS;
  return 0.62 * g + 0.38 * wobble(x, y, z) - 0.45 * peel;
}
