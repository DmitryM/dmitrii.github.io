import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  ZeroFactor,
  type DataTexture,
  type IUniform,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { Chapter, FrameInfo, Readout } from '../../../Chapter';
import type { BlackHole } from '../BlackHole';
import type { Tier } from '../../../Quality';
import { FullscreenPass, clamp, damp, smoothstep } from '../../../util';
import { blackbodyChroma } from '../../../../physics/blackbody';
import { R_CAPTURE, TIDAL_R, TIME_LAPSE, aimLaunch, debrisStrength, dopplerFactor, gravitationalShift, lensedImpact, step, stepDebris, tidalStretch } from '../../../../physics/infall';
import type { JunkId } from '../../../../i18n/index.ts';
import { BODY_RADIUS, MASS, dissolveThreshold, modelGeometry, surfaceSamples, type SurfaceSamples } from './models';
import junkVert from './junk.vert';
import junkFrag from './junk.frag';
import debrisVert from './debris.vert';
import debrisFrag from './debris.frag';

export interface JunkEvent {
  type: 'shred' | 'swallowed';
  uid: number;
  id: JunkId;
  /** radius of the disruption, r_s */
  r: number;
}

export interface Caption {
  uid: number;
  id: JunkId;
  /** CSS pixels */
  x: number;
  y: number;
  radius: number;
  alpha: number;
  /** drifting by on its own (click it to throw it in) */
  drifting: boolean;
}

type State = 'drifting' | 'held' | 'falling' | 'shredding' | 'done';

interface Body {
  uid: number;
  id: JunkId;
  state: State;
  mesh: Mesh<BufferGeometry, ShaderMaterial>;
  samples: SurfaceSamples;
  mass: number;
  p: Vector3;
  v: Vector3;
  /** where the pointer holds it */
  target: Vector3;
  /** distance of its plane of the sky from the hole's, toward the camera (r_s) */
  depth: number;
  /** velocity while drifting by, r_s per real second */
  drift: Vector3;
  wasDrifting: boolean;
  q: Quaternion;
  /** angular velocity, rad per real second */
  w: Vector3;
  age: number;
  fade: number;
  stretch: number;
  heat: number;
  // disruption
  dissolve: number;
  /** range swept by the dissolve front: the body's own threshold range */
  d0: number;
  d1: number;
  shredT: number;
  shredR: number;
  peelDir: Vector3;
  thr: Float32Array | null;
  order: Uint32Array | null;
  next: number;
  released: number;
  alive: number;
  doneT: number;
  announced: boolean;
}

/** How long the dissolve front takes to sweep across a body, real seconds. */
const SHRED_TIME = 0.6;
/** Default range of the dissolve front in threshold units (see dissolveThreshold). */
const D0 = -0.6;
const D1 = 1.1;
const MAX_FLYING = 6;
/**
 * Clock of the objects drifting by: far slower than the infall's time-lapse, so the hole's
 * gravity only bends their paths (a hyperbolic flyby) instead of swallowing them.
 */
const DRIFT_LAPSE = 2.6;
/**
 * Drifters keep at least this far from the hole, r_s; when they pass behind it, also this far
 * from it in the plane of the sky (so they are never seen sliding across the shadow).
 */
const DRIFT_CLEARANCE = 7.5;
const DRIFT_SKY_CLEARANCE = 6;
const MAX_BODIES = 10;
const PARTICLE_LIFE = 14;

const _v = new Vector3();
const _w = new Vector3();
const _m4 = new Matrix4();
const _q = new Quaternion();

const chromaCache = new Map<number, [number, number, number]>();
function chroma(T: number) {
  const key = Math.round(T / 50) * 50;
  let c = chromaCache.get(key);
  if (!c) {
    c = blackbodyChroma(key);
    chromaCache.set(key, c);
  }
  return c;
}
const WHITE = chroma(6500);

/** Paczyński–Wiita gravity on the drift clock (real seconds, semi-implicit Euler). */
function driftStep(p: Vector3, v: Vector3, dt: number) {
  const r = Math.max(p.length(), 1.5);
  const a = (-0.5 / ((r - 1) * (r - 1) * r)) * DRIFT_LAPSE * DRIFT_LAPSE;
  v.addScaledVector(p, a * dt);
  p.addScaledVector(v, dt);
}

/**
 * Things a visitor throws into the black hole, and what the hole does to them: a tidal
 * disruption event. Each object falls on a Paczyński–Wiita orbit, is stretched by the tidal field,
 * and is torn apart inside the tidal radius into debris that whips around the hole, circularises,
 * heats up and is swallowed, flaring the accretion disk. Rendered with the black hole's camera
 * (and the same lensing) into its own buffer, then composited over the ray-traced image.
 */
export class Junk implements Chapter {
  readonly name = 'junk';
  weight = 0;
  /** disk brightening from the accretion of debris, 0…2 */
  flare = 0;
  /** accretion rate in Eddington units (for the readout) */
  mdot = 0;
  readonly events: JunkEvent[] = [];
  readonly reduced: boolean;
  /** slow motion for debugging (`__junk.timeScale = 0.1` with ?debug) */
  timeScale = 1;

  private readonly bodies: Body[] = [];
  private readonly byUid = new Map<number, Body>();
  private uid = 1;
  private rate = 0;
  private kickPending = 0;
  private idle = 0;

  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera();
  private target: WebGLRenderTarget | null = null;
  private readonly composite: FullscreenPass;
  private readonly shared: Record<string, IUniform>;

  // debris pool
  private readonly cap: number;
  private readonly perBody: number;
  private readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly data: Float32Array;
  private readonly age: Float32Array;
  private readonly owner: Int32Array;
  private live = 0;
  private cursor = 0;
  private hi = 0;
  private colorsDirty = false;

  private cssW = 1;
  private cssH = 1;
  private bufferW = 1;
  private bufferH = 1;

  constructor(
    private readonly bh: BlackHole,
    lut: DataTexture,
    atlas: Texture,
    tier: Tier,
    options: { reduced: boolean },
  ) {
    this.reduced = options.reduced;
    this.cap = tier.junkParticles;
    this.perBody = Math.min(4200, Math.round(tier.junkParticles / 4.5));
    this.camera.matrixAutoUpdate = false;

    this.shared = {
      uObsDir: { value: new Vector3(0, 0, 1) },
      uLensing: { value: 1 },
      uCamPos: { value: new Vector3() },
      uDiskTemp: { value: 5400 },
      uKey: { value: 1 },
      uTime: { value: 0 },
      uBlackbody: { value: lut },
      uAtlas: { value: atlas },
      uRadius: { value: BODY_RADIUS },
    };

    // debris
    const n = this.cap;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.data = new Float32Array(n * 4);
    this.age = new Float32Array(n);
    this.owner = new Int32Array(n);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aVel', new BufferAttribute(this.vel, 3));
    g.setAttribute('aColor', new BufferAttribute(this.col, 3));
    g.setAttribute('aData', new BufferAttribute(this.data, 4));
    for (const name of ['position', 'aVel', 'aData']) (g.getAttribute(name) as BufferAttribute).setUsage(35048 /* DynamicDrawUsage */);
    g.setDrawRange(0, 0);
    this.points = new Points(
      g,
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: debrisVert,
        fragmentShader: debrisFrag,
        uniforms: { ...this.shared, uPointScale: { value: 1 } },
        // pure light: add the colour, leave the coverage (alpha) of the objects untouched
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: ZeroFactor,
        blendDstAlpha: OneFactor,
        depthTest: true,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;
    this.scene.add(this.points);

    this.composite = new FullscreenPass({
      uniforms: { uTex: { value: null }, uWeight: { value: 1 } },
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform float uWeight;
        in vec2 vUv;
        out vec4 fragColor;
        void main() { fragColor = texture(uTex, vUv) * uWeight; }`,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
      transparent: true,
    });
  }

  /** Pre-compiles both programs (call once, while nothing is in flight). */
  async compile(renderer: WebGLRenderer) {
    const probe = new Mesh(modelGeometry('duck'), this.bodyMaterial());
    probe.frustumCulled = false;
    this.scene.add(probe);
    this.syncCamera();
    await renderer.compileAsync(this.scene, this.camera);
    await renderer.compileAsync(this.composite.scene, this.composite.camera);
    this.scene.remove(probe);
    probe.material.dispose();
  }

  private bodyMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: junkVert,
      fragmentShader: junkFrag,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
      uniforms: {
        ...this.shared,
        uRot: { value: new Matrix3() },
        uCenter: { value: new Vector3() },
        uAxis: { value: new Vector3(1, 0, 0) },
        uStretch: { value: 1 },
        uShift: { value: new Vector3(1, 1, 1) },
        uBright: { value: 1 },
        uHeat: { value: 0 },
        uDissolve: { value: D0 },
        uBurning: { value: 0 },
        uPeelDir: { value: new Vector3(1, 0, 0) },
        uFade: { value: 0 },
      },
    });
  }

  /** Whether anything is in flight, being torn apart, or still glowing. */
  get alive(): boolean {
    return this.bodies.length > 0 || this.live > 0 || this.flare > 0.003;
  }

  // ── throwing ───────────────────────────────────────────────────────────────────────────────

  /** Picks an object up at a screen point (CSS px); move it with moveHeld, let go with release. */
  hold(id: JunkId, x: number, y: number): number {
    this.makeRoom();
    return this.addBody(id, this.spawnPoint(x, y, 0, new Vector3()), 'held', 0);
  }

  private addBody(id: JunkId, p: Vector3, state: State, depth: number): number {
    const rand = Math.random;
    const b: Body = {
      uid: this.uid++,
      id,
      state,
      mesh: new Mesh(modelGeometry(id), this.bodyMaterial()),
      samples: surfaceSamples(id, this.perBody),
      mass: MASS[id] ?? 1,
      p,
      v: new Vector3(),
      target: p.clone(),
      depth,
      drift: new Vector3(),
      wasDrifting: false,
      q: new Quaternion().setFromAxisAngle(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * Math.PI * 2),
      w: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(0.8 + rand() * 1.4),
      age: 0,
      fade: 0,
      stretch: 1,
      heat: 0,
      dissolve: D0,
      d0: D0,
      d1: D1,
      shredT: 0,
      shredR: 0,
      peelDir: new Vector3(1, 0, 0),
      thr: null,
      order: null,
      next: 0,
      released: 0,
      alive: 0,
      doneT: 0,
      announced: false,
    };
    b.mesh.frustumCulled = false;
    this.scene.add(b.mesh);
    this.bodies.push(b);
    this.byUid.set(b.uid, b);
    this.idle = 0;
    return b.uid;
  }

  moveHeld(uid: number, x: number, y: number) {
    const b = this.find(uid);
    if (b?.state === 'held') this.spawnPoint(x, y, b.depth, b.target);
  }

  /** Number of objects drifting by on their own. */
  get drifting(): number {
    let n = 0;
    for (const b of this.bodies) if (b.state === 'drifting') n++;
    return n;
  }

  /**
   * Sends an object drifting through the view: a slow, tumbling flyby whose path the hole's
   * gravity bends, well clear of the hole and away from the hero text. Returns its id, or null
   * when no good path turned up this time.
   */
  spawnDrifter(id: JunkId): number | null {
    this.syncCamera();
    const W = this.cssW;
    const H = this.cssH;
    const portrait = W / H < 0.9;
    const m = Math.min(W, H) * 0.14;
    // the hero copy sits bottom-left on wide screens and along the bottom on phones
    const overText = (x: number, y: number) => (portrait ? y > H * 0.55 : x < W * 0.76 && y > H * 0.46);
    const obs = new Vector3().copy(this.bh.view.camPos).normalize();
    for (let attempt = 0; attempt < 60; attempt++) {
      // a point in the open sky that the path goes through, and a direction; the path runs from
      // just beyond one edge of the view to just beyond another
      const mx = W * (0.15 + 0.7 * Math.random());
      const my = H * (0.1 + (portrait ? 0.4 : 0.42) * Math.random());
      if (overText(mx, my)) continue;
      const th = Math.random() * Math.PI * 2;
      const dx = Math.cos(th);
      const dy = Math.sin(th);
      const exit = (sx: number, sy: number) => Math.min(Math.abs(sx) > 1e-6 ? ((sx > 0 ? W + m : -m) - mx) / sx : Infinity, Math.abs(sy) > 1e-6 ? ((sy > 0 ? H + m : -m) - my) / sy : Infinity);
      const tB = exit(dx, dy);
      const tA = exit(-dx, -dy);
      const ax = mx - dx * tA;
      const ay = my - dy * tA;
      const bx = mx + dx * tB;
      const by = my + dy * tB;
      if (tA + tB < 0.8 * Math.min(W, H)) continue;
      let crossesText = false;
      for (const f of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85]) if (overText(ax + (bx - ax) * f, ay + (by - ay) * f)) crossesText = true;
      if (crossesText) continue;
      // they pass in front of the hole, like foreground debris; the hole and its disk fill most
      // of the sky, and in front they stay clear of it in 3-D while floating over the disk.
      // Phones have even less sky around the hole: nearer still (and bigger on the small screen)
      const depth = portrait ? 7 + Math.random() * 5 : 1 + Math.random() * 9;
      const A = this.planePoint(ax, ay, depth, new Vector3());
      const B = this.planePoint(bx, by, depth, new Vector3());
      // an unhurried pace: about 9–14 s to drift across the shorter side of the view
      const T = (tA + tB) / (Math.min(W, H) / (9 + Math.random() * 5));
      const v = B.clone().sub(A).divideScalar(T);
      // fly it once to make sure it stays clear of the hole
      const p = A.clone();
      const u = v.clone();
      let ok = true;
      for (let t = 0; t < T * 1.4 && ok; t += 0.1) {
        driftStep(p, u, 0.1);
        const along = p.dot(obs);
        const sky = Math.sqrt(Math.max(0, p.lengthSq() - along * along));
        if (p.length() < DRIFT_CLEARANCE || (along < 0 && sky < DRIFT_SKY_CLEARANCE)) ok = false;
      }
      if (!ok) continue;
      const uid = this.addBody(id, A, 'drifting', depth);
      const b = this.find(uid)!;
      b.drift.copy(v);
      // a lazier tumble than a throw
      b.w.multiplyScalar(0.4);
      return uid;
    }
    return null;
  }

  /** The drifting object under a screen point (CSS px), if any. */
  pick(x: number, y: number): number | null {
    if (this.drifting === 0) return null;
    this.syncCamera();
    let best: number | null = null;
    let bestD = Infinity;
    const s = { x: 0, y: 0, radius: 0 };
    for (const b of this.bodies) {
      if (b.state !== 'drifting') continue;
      this.screenOf(b, s);
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < s.radius * 0.9 + 18 && d < bestD) {
        bestD = d;
        best = b.uid;
      }
    }
    return best;
  }

  /** Takes hold of a drifting object (to fling it). */
  grab(uid: number, x: number, y: number) {
    const b = this.find(uid);
    if (b?.state !== 'drifting') return;
    b.state = 'held';
    b.wasDrifting = true;
    this.spawnPoint(x, y, b.depth, b.target);
  }

  /** Sends a drifting object in, keeping its momentum. */
  throwDrifter(uid: number) {
    const b = this.find(uid);
    if (b?.state !== 'drifting') return;
    b.state = 'held';
    b.wasDrifting = true;
    b.target.copy(b.p);
    this.release(uid);
  }

  /** Lets go with the pointer's velocity (CSS px per second). */
  release(uid: number, vx = 0, vy = 0) {
    const b = this.find(uid);
    if (!b || b.state !== 'held') return;
    const view = this.bh.view;
    const r0 = b.p.length();
    // pointer velocity → velocity in the plane of the sky, in units of c
    const worldPerPx = (2 * view.camPos.length() * view.tanHalfFov) / this.cssH;
    const v = _v
      .copy(view.right)
      .multiplyScalar(vx * worldPerPx)
      .addScaledVector(view.up, -vy * worldPerPx)
      .divideScalar(TIME_LAPSE);
    let fling = v.length() > 0.03;
    // a drifter that is just clicked keeps some of its momentum and heads for the hole
    if (!fling && b.wasDrifting) {
      v.copy(b.drift).divideScalar(TIME_LAPSE * 2).addScaledVector(b.p, -0.045 / r0);
      fling = true;
    }
    // a plain drop gets a little push toward the hole so it doesn't dawdle
    if (!fling) v.addScaledVector(b.p, -0.05 / r0);
    const heavy = b.mass > 1;
    // pericentre: outside the centrifugal barrier, so it whips around the hole instead of
    // plunging; the heavy one grazes the barrier for a few zoom-whirl turns
    const rp = heavy ? 2.45 + Math.random() * 0.25 : fling ? 2.7 + Math.random() * 2.3 : 2.9 + Math.random() * 1.6;
    const obs = _w.copy(view.camPos).normalize();
    const aimed = aimLaunch(b.p, v, rp, Math.max(r0 * 1.2, r0 + 2.5), obs);
    b.v.set(aimed.x, aimed.y, aimed.z);
    b.state = 'falling';
    b.age = 0;
  }

  /** Throws an object from a screen point in one go. */
  throwAt(id: JunkId, x: number, y: number, vx = 0, vy = 0): number {
    const uid = this.hold(id, x, y);
    const b = this.find(uid)!;
    b.p.copy(b.target);
    this.release(uid, vx, vy);
    return uid;
  }

  /** Screen position of the hole's centre (CSS px). */
  holeOnScreen() {
    const s = this.bh.view.lensShift;
    return { x: ((s.x + 1) / 2) * this.cssW, y: ((1 - s.y) / 2) * this.cssH };
  }

  private find(uid: number) {
    return this.byUid.get(uid);
  }

  /** Keeps the number of objects bounded: the oldest flying one is torn apart at once. */
  private makeRoom() {
    const flying = this.bodies.filter((b) => b.state === 'falling' || b.state === 'shredding');
    // (drifters don't count: they leave on their own)
    if (flying.length >= MAX_FLYING) {
      const oldest = flying.find((b) => b.state === 'falling');
      if (oldest) this.beginShred(oldest);
    }
    while (this.bodies.length >= MAX_BODIES) {
      const i = this.bodies.findIndex((b) => b.state === 'done');
      if (i < 0) break;
      this.removeBody(i);
    }
  }

  /** Screen point (CSS px) → a plane of the sky, `depth` r_s from the hole toward the camera. */
  private planePoint(x: number, y: number, depth: number, out: Vector3): Vector3 {
    const v = this.bh.view;
    const nx = (x / this.cssW) * 2 - 1 - v.lensShift.x;
    const ny = -((y / this.cssH) * 2 - 1) - v.lensShift.y;
    const dir = _v
      .copy(v.fwd)
      .addScaledVector(v.right, nx * v.aspect * v.tanHalfFov)
      .addScaledVector(v.up, ny * v.tanHalfFov);
    const o = _w.copy(v.camPos).normalize();
    const t = (depth - v.camPos.dot(o)) / Math.min(dir.dot(o), -1e-3);
    return out.copy(v.camPos).addScaledVector(dir, t);
  }

  /** Where a thrown object starts: on the pointer, kept within a sensible distance of the hole. */
  private spawnPoint(x: number, y: number, depth: number, out: Vector3): Vector3 {
    this.planePoint(x, y, depth, out);
    const r = out.length();
    if (r < 1e-3) out.copy(this.bh.view.right);
    return out.setLength(clamp(r, 7.5, 26));
  }

  // ── the disruption ─────────────────────────────────────────────────────────────────────────

  private beginShred(b: Body) {
    b.state = 'shredding';
    b.shredT = 0;
    b.shredR = b.p.length();
    // the side facing the hole goes first; express that direction in the body's own frame
    b.peelDir.copy(b.p).negate().normalize().applyQuaternion(_q.copy(b.q).invert());
    const s = b.samples;
    const thr = new Float32Array(s.count);
    for (let i = 0; i < s.count; i++) {
      thr[i] = dissolveThreshold(s.position[i * 3]!, s.position[i * 3 + 1]!, s.position[i * 3 + 2]!, b.peelDir, s.mat[i * 2]!);
    }
    const order = new Uint32Array(s.count);
    for (let i = 0; i < s.count; i++) order[i] = i;
    order.sort((a, c) => thr[a]! - thr[c]!);
    // sweep exactly across this body's thresholds (plus the width of the glowing band)
    b.d0 = thr[order[0]!]! - 0.02;
    b.d1 = thr[order[order.length - 1]!]! + 0.1;
    b.dissolve = b.d0;
    b.thr = thr;
    b.order = order;
    b.next = 0;
    this.kickPending += 0.45 * Math.sqrt(b.mass);
    this.events.push({ type: 'shred', uid: b.uid, id: b.id, r: b.shredR });
  }

  /** Turns surface samples into free debris as the dissolve front passes them. */
  private releaseUpTo(b: Body, front: number) {
    const s = b.samples;
    const order = b.order!;
    const thr = b.thr!;
    const rot = _m4.makeRotationFromQuaternion(b.q);
    const axis = _w.copy(b.p).negate().normalize();
    const sq = 1 / Math.sqrt(b.stretch);
    const wSim = b.w.clone().divideScalar(TIME_LAPSE);
    const o = new Vector3();
    const nrm = new Vector3();
    while (b.next < order.length && thr[order[b.next]!]! <= front) {
      const k = order[b.next++]!;
      o.set(s.position[k * 3]!, s.position[k * 3 + 1]!, s.position[k * 3 + 2]!).applyMatrix4(rot);
      const along = o.dot(axis);
      o.multiplyScalar(sq).addScaledVector(axis, along * (b.stretch - sq));
      nrm.set(s.normal[k * 3]!, s.normal[k * 3 + 1]!, s.normal[k * 3 + 2]!).applyMatrix4(rot);
      const i = this.alloc();
      this.pos[i * 3] = b.p.x + o.x;
      this.pos[i * 3 + 1] = b.p.y + o.y;
      this.pos[i * 3 + 2] = b.p.z + o.z;
      // rigid-body velocity of that point, plus a small kick off the surface
      const kick = 0.006 + Math.random() * 0.014;
      _v.crossVectors(wSim, o);
      this.vel[i * 3] = b.v.x + _v.x + nrm.x * kick;
      this.vel[i * 3 + 1] = b.v.y + _v.y + nrm.y * kick;
      this.vel[i * 3 + 2] = b.v.z + _v.z + nrm.z * kick;
      this.col[i * 3] = s.color[k * 3]!;
      this.col[i * 3 + 1] = s.color[k * 3 + 1]!;
      this.col[i * 3 + 2] = s.color[k * 3 + 2]!;
      this.data[i * 4] = 0.15;
      this.data[i * 4 + 1] = 1;
      this.data[i * 4 + 2] = 0.06 + Math.random() * 0.07;
      this.data[i * 4 + 3] = s.mat[k * 2 + 1]!;
      this.age[i] = 0;
      this.owner[i] = b.uid;
      b.released++;
      b.alive++;
      this.colorsDirty = true;
    }
  }

  private alloc(): number {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    if (this.data[i * 4 + 1]! > 0) this.kill(i, false);
    this.live++;
    this.hi = Math.max(this.hi, i + 1);
    return i;
  }

  private kill(i: number, accreted: boolean) {
    this.data[i * 4 + 1] = 0;
    this.live--;
    const b = this.find(this.owner[i]!);
    if (b) {
      b.alive--;
      if (accreted) this.rateAcc += b.mass / b.samples.count;
    }
  }
  private rateAcc = 0;

  private removeBody(index: number) {
    const b = this.bodies[index]!;
    this.scene.remove(b.mesh);
    b.mesh.material.dispose();
    this.bodies.splice(index, 1);
    this.byUid.delete(b.uid);
  }

  // ── per frame ──────────────────────────────────────────────────────────────────────────────

  update(frame: FrameInfo) {
    const dt = frame.dt * this.timeScale;
    if (!this.alive) {
      // free the offscreen buffer after a while
      this.idle += dt;
      if (this.idle > 15 && this.target) {
        this.target.dispose();
        this.target = null;
      }
      return;
    }
    this.idle = 0;
    const dts = dt * TIME_LAPSE;
    this.syncCamera();

    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i]!;
      b.age += dt;
      b.fade = Math.min(1, b.fade + dt / 0.18);
      if (b.state === 'drifting') {
        driftStep(b.p, b.drift, dt);
        _q.setFromAxisAngle(_v.copy(b.w).normalize(), b.w.length() * dt);
        b.q.premultiply(_q);
        b.stretch = 1;
        // gone once it has crossed the view
        if ((b.age > 3 && this.offscreen(b)) || b.age > 60) {
          this.removeBody(i);
          continue;
        }
      } else if (b.state === 'held') {
        // follows the pointer with a little lag, tugged and stretched toward the hole
        b.p.lerp(b.target, damp(16, dt));
        const r = b.p.length();
        b.stretch = 1 + (tidalStretch(r) - 1) * 0.7;
        _q.setFromAxisAngle(_v.copy(b.w).normalize(), b.w.length() * dt * 0.35);
        b.q.premultiply(_q);
      } else if (b.state !== 'done') {
        // speed ramp: a little slow motion on the way in, so the object can be seen, then full
        // speed from the tidal radius on, so the disruption keeps its snap
        const ramp = b.state === 'shredding' ? 1 : 0.7 + 0.3 * smoothstep(TIDAL_R * 1.8, TIDAL_R * 1.05, b.p.length());
        const r = step(b.p, b.v, dts * ramp);
        _q.setFromAxisAngle(_v.copy(b.w).normalize(), b.w.length() * dt * ramp);
        b.q.premultiply(_q);
        b.stretch = tidalStretch(r);
        // tidal heating sets in just outside the tidal radius
        b.heat = 0.45 * smoothstep(TIDAL_R * 1.35, TIDAL_R * 0.8, r);
        if (b.state === 'falling' && (r <= TIDAL_R || b.age > 14)) this.beginShred(b);
        if (b.state === 'shredding') {
          b.shredT += dt;
          const t = clamp(b.shredT / SHRED_TIME);
          b.dissolve = b.d0 + (b.d1 - b.d0) * t;
          b.stretch *= 1 + 0.9 * t;
          b.heat = Math.max(b.heat, 0.35 + 0.65 * t);
          this.releaseUpTo(b, b.dissolve);
          if (t >= 1 || r < 1.8) {
            this.releaseUpTo(b, Infinity);
            b.state = 'done';
            b.mesh.visible = false;
          }
        }
      } else {
        b.doneT += dt;
        if (!b.announced && (b.alive <= b.released * 0.25 || b.doneT > 4.5)) {
          b.announced = true;
          this.events.push({ type: 'swallowed', uid: b.uid, id: b.id, r: b.shredR });
        }
        if (b.announced && (b.alive <= 0 || b.doneT > PARTICLE_LIFE)) this.removeBody(i);
        continue;
      }
      this.updateBodyUniforms(b);
    }

    this.updateDebris(dt, dts);

    // accretion rate → flare (fast rise, slow decay) and readout
    const inst = dt > 0 ? this.rateAcc / dt : 0;
    this.rateAcc = 0;
    this.rate += (inst - this.rate) * damp(3, dt);
    const target = 2 * (1 - Math.exp(-this.rate / 1.3));
    const before = this.flare;
    this.flare += (target - this.flare) * damp(target > this.flare ? 5 : 0.9, dt);
    if (this.flare < 0.003 && target < 0.003) this.flare = 0;
    this.kickPending += Math.max(0, this.flare - before) * 1.1;
    this.mdot = this.rate * 2.2;

    const sh = this.shared;
    sh.uTime!.value = frame.time;
    sh.uKey!.value = 1 + 1.4 * this.flare;
  }

  private updateBodyUniforms(b: Body) {
    const u = b.mesh.material.uniforms;
    const r = b.p.length();
    (u.uRot!.value as Matrix3).setFromMatrix4(_m4.makeRotationFromQuaternion(b.q));
    (u.uCenter!.value as Vector3).copy(b.p);
    (u.uAxis!.value as Vector3).copy(b.p).negate().normalize();
    u.uStretch!.value = b.stretch;
    u.uHeat!.value = b.heat;
    u.uDissolve!.value = b.dissolve;
    u.uBurning!.value = b.state === 'shredding' ? 1 : 0;
    (u.uPeelDir!.value as Vector3).copy(b.peelDir);
    u.uFade!.value = b.fade;
    // relativistic shift of the body's light toward the observer
    const n = _v.copy(this.bh.view.camPos).sub(b.p).normalize();
    const beta = b.v.length();
    const g = dopplerFactor(beta, beta > 1e-6 ? b.v.dot(n) / beta : 0) * gravitationalShift(r);
    const c = chroma(clamp(6500 * g, 1000, 40000));
    (u.uShift!.value as Vector3).set(c[0] / WHITE[0], c[1] / WHITE[1], c[2] / WHITE[2]);
    u.uBright!.value = clamp(g * g * g, 0.15, 3);
  }

  private updateDebris(dt: number, dts: number) {
    if (this.live <= 0) {
      this.points.geometry.setDrawRange(0, 0);
      return;
    }
    const data = this.data;
    let hi = 0;
    for (let i = 0; i < this.hi; i++) {
      if (data[i * 4 + 1]! <= 0) continue;
      const a = (this.age[i] = this.age[i]! + dt);
      const r = stepDebris(this.pos, this.vel, i, dts, debrisStrength(a));
      // shock heating sets in within half a second of release
      data[i * 4] = Math.min(1, data[i * 4]! + dt * 1.8);
      if (r < R_CAPTURE) {
        this.kill(i, true);
        continue;
      }
      if (r > 70 || a > PARTICLE_LIFE) {
        this.kill(i, false);
        continue;
      }
      // the unbound tail fades as it leaves
      data[i * 4 + 1] = Math.min(1, PARTICLE_LIFE - a) * (1 - smoothstep(32, 70, r));
      hi = i + 1;
    }
    this.hi = hi;
    const g = this.points.geometry;
    g.setDrawRange(0, hi);
    for (const name of ['position', 'aVel', 'aData'] as const) {
      const attr = g.getAttribute(name) as BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, hi * attr.itemSize);
      attr.needsUpdate = true;
    }
    if (this.colorsDirty) {
      const attr = g.getAttribute('aColor') as BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, hi * 3);
      attr.needsUpdate = true;
      this.colorsDirty = false;
    }
  }

  /** Jolt accumulated since the last call (for the camera and the zoom blur). */
  takeKick(): number {
    const k = this.kickPending;
    this.kickPending = 0;
    return k;
  }

  /** Lensed screen position (CSS px) and apparent radius of a body, as the shaders draw it. */
  private screenOf(b: Body, out: { x: number; y: number; radius: number }) {
    const view = this.bh.view;
    const obs = _w.copy(view.camPos).normalize();
    const r = b.p.length();
    const along = b.p.dot(obs);
    const perp = _v.copy(b.p).addScaledVector(obs, -along);
    const d = perp.length();
    const bimp = d + (lensedImpact(r, along / r) - d) * view.lensing;
    if (d > 1e-5) perp.multiplyScalar(bimp / d);
    perp.addScaledVector(obs, along);
    const depth = Math.max(_w.copy(perp).sub(view.camPos).dot(view.fwd), 1);
    perp.project(this.camera);
    out.x = ((perp.x + 1) / 2) * this.cssW;
    out.y = ((1 - perp.y) / 2) * this.cssH;
    out.radius = (BODY_RADIUS * this.cssH) / (2 * view.tanHalfFov) / depth;
    return out;
  }

  private offscreen(b: Body) {
    const s = this.screenOf(b, { x: 0, y: 0, radius: 0 });
    const m = s.radius + 40;
    return s.x < -m || s.x > this.cssW + m || s.y < -m || s.y > this.cssH + m;
  }

  /** Where the objects are on screen, for their captions. */
  captions(out: Caption[] = []): Caption[] {
    out.length = 0;
    if (this.bodies.length === 0) return out;
    this.syncCamera();
    const s = { x: 0, y: 0, radius: 0 };
    for (const b of this.bodies) {
      if (b.state === 'done') continue;
      this.screenOf(b, s);
      const alpha = b.fade * (b.state === 'shredding' ? 1 - clamp(b.shredT / (SHRED_TIME * 0.5)) : 1);
      out.push({ uid: b.uid, id: b.id, x: s.x, y: s.y, radius: s.radius, alpha: alpha * this.weight, drifting: b.state === 'drifting' });
    }
    return out;
  }

  private syncCamera() {
    const v = this.bh.view;
    const m = this.camera.matrix;
    m.makeBasis(v.right, v.up, _v.copy(v.fwd).negate()).setPosition(v.camPos);
    this.camera.matrixWorld.copy(m);
    this.camera.matrixWorldInverse.copy(m).invert();
    const near = 0.05;
    const top = near * v.tanHalfFov;
    const right = top * v.aspect;
    const p = this.camera.projectionMatrix;
    p.makePerspective(-right, right, top, -top, near, 500);
    // the hole is composed off-centre: shift the image like the tracer does
    p.elements[8] = -v.lensShift.x;
    p.elements[9] = -v.lensShift.y;
    this.camera.projectionMatrixInverse.copy(p).invert();

    const sh = this.shared;
    (sh.uObsDir!.value as Vector3).copy(v.camPos).normalize();
    (sh.uCamPos!.value as Vector3).copy(v.camPos);
    sh.uLensing!.value = v.lensing;
    sh.uDiskTemp!.value = v.diskTemp;
    this.points.material.uniforms.uPointScale!.value = this.bufferH / (2 * v.tanHalfFov);
  }

  prepare(renderer: WebGLRenderer) {
    const w = Math.max(2, this.bufferW);
    const h = Math.max(2, this.bufferH);
    const samples = this.bufferH / this.cssH < 1.5 ? 4 : 0;
    if (!this.target || this.target.width !== w || this.target.height !== h || this.target.samples !== samples) {
      this.target?.dispose();
      this.target = new WebGLRenderTarget(w, h, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true, samples });
    }
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
  }

  draw(renderer: WebGLRenderer) {
    if (!this.target) return;
    const u = this.composite.material.uniforms;
    u.uTex!.value = this.target.texture;
    u.uWeight!.value = this.weight;
    renderer.render(this.composite.scene, this.composite.camera);
  }

  resize(bw: number, bh: number, cw: number, ch: number) {
    this.bufferW = bw;
    this.bufferH = bh;
    this.cssW = cw;
    this.cssH = ch;
  }

  fieldOfViewLog10() {
    return 0;
  }

  readouts(): Readout[] {
    return [];
  }

  dispose() {
    while (this.bodies.length) this.removeBody(0);
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.composite.dispose();
    this.target?.dispose();
  }
}
