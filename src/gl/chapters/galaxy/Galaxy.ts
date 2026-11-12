import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  GLSL3,
  Mesh,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  ZeroFactor,
  DoubleSide,
  AddEquation,
  type WebGLRenderer,
} from 'three';
import type { Chapter, FrameInfo, Readout } from '../../Chapter';
import { clamp, damp, easeInOutCubic, lerp, smoothstep } from '../../util';
import { blackbodyChroma } from '../../../physics/blackbody';
import { mulberry32 } from '../../../physics/hydrogen';
import { UI, clientLocale } from '../../../i18n/index.ts';
import starsVert from './stars.vert';
import starsFrag from './stars.frag';
import dustFrag from './dust.frag';
import diskVert from './disk.vert';
import diskFrag from './disk.frag';
import glowVert from './glow.vert';
import glowFrag from './glow.frag';

/** 1 scene unit = 2.5 kly, so the 20-unit disk is ~100 kly across. */
const UNIT_M = 2.5e3 * 9.4607e15;
const DEG = Math.PI / 180;

const PARAMS = { coreR: 2.2, vrot: 0.11, pattern: 0.0065, pitchDeg: 13, armA0: 2.1 };
const D_NEAR = 0.004;
const D_FAR = 54;
const Z_STAR = 0.3; // zoom fraction spent at "star" scale before the pull-back begins
const HERO = { a: 9.6, phase: 1.15 };
const ARM_K = 1 / Math.tan((PARAMS.pitchDeg * Math.PI) / 180);

/** Same as galaxyPos() in orbit.glsl for an old-population star in the mid-plane. */
function galaxyOrbit(a: number, phase: number, time: number, out: Vector3) {
  const t = phase + (PARAMS.vrot / Math.max(a, PARAMS.coreR)) * time;
  return out.set(a * Math.cos(t), 0, a * Math.sin(t));
}

/** Trailing logarithmic spiral: azimuth of arm `arm` at radius a. */
/**
 * Trailing logarithmic spiral with low-frequency wobble: real arms kink, branch and vary in pitch,
 * and perfectly regular spirals read as artificial.
 */
function armAngle(a: number, arm: number) {
  const wobble = 0.24 * Math.sin(a * 0.82 + arm * 2.1) + 0.11 * Math.sin(a * 2.3 + arm * 0.7 + 1.3);
  return arm * Math.PI - ARM_K * Math.log(a / PARAMS.armA0) + wobble;
}

const bbCache = new Map<number, [number, number, number]>();
function starColor(T: number): [number, number, number] {
  const key = Math.round(T / 100) * 100;
  let c = bbCache.get(key);
  if (!c) {
    c = blackbodyChroma(key);
    bbCache.set(key, c);
  }
  return c;
}

function gaussian(rand: () => number) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

interface Layer {
  orbit: Float32Array;
  phase: Float32Array;
  kind: Float32Array;
  params: Float32Array;
  color: Float32Array;
  n: number;
}

function makeLayer(n: number): Layer {
  return {
    orbit: new Float32Array(n),
    phase: new Float32Array(n),
    kind: new Float32Array(n),
    params: new Float32Array(n * 3),
    color: new Float32Array(n * 3),
    n: 0,
  };
}

function push(l: Layer, a: number, phase: number, kind: number, y: number, size: number, bright: number, c: readonly number[]) {
  const i = l.n++;
  l.orbit[i] = a;
  l.phase[i] = phase;
  l.kind[i] = kind;
  l.params[i * 3] = y;
  l.params[i * 3 + 1] = size;
  l.params[i * 3 + 2] = bright;
  l.color[i * 3] = c[0]!;
  l.color[i * 3 + 1] = c[1]!;
  l.color[i * 3 + 2] = c[2]!;
}

function layerGeometry(l: Layer): BufferGeometry {
  const g = new BufferGeometry();
  g.setDrawRange(0, l.n);
  g.setAttribute('position', new BufferAttribute(new Float32Array(l.orbit.length * 3), 3));
  g.setAttribute('aOrbit', new BufferAttribute(l.orbit, 1));
  g.setAttribute('aPhase', new BufferAttribute(l.phase, 1));
  g.setAttribute('aKind', new BufferAttribute(l.kind, 1));
  g.setAttribute('aParams', new BufferAttribute(l.params, 3));
  g.setAttribute('aColor', new BufferAttribute(l.color, 3));
  return g;
}

export class Galaxy implements Chapter {
  readonly name = 'galaxy';
  weight = 0;
  /** chapter IV zoom-out progress */
  zoom = 0;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 0.0005, 4000);

  private readonly stars: Points<BufferGeometry, ShaderMaterial>;
  private readonly dust: Points<BufferGeometry, ShaderMaterial>;
  private readonly haze: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly hazeUniforms: Record<string, { value: number }>;
  private readonly background: Points<BufferGeometry, ShaderMaterial>;
  private readonly deepField: Points<BufferGeometry, ShaderMaterial>;
  private readonly core: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly hero: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly uniforms;
  private readonly heroPos = new Vector3();
  private readonly target = new Vector3();
  private cssW = 1;
  private cssH = 1;
  private dist = D_NEAR;
  private heroFade = 1;
  private readonly loc = clientLocale();
  private stageX = 0.5;
  private stageY = 0.5;

  constructor(count: number) {
    const rand = mulberry32(2024);
    this.uniforms = {
      uTime: { value: 0 },
      uCoreR: { value: PARAMS.coreR },
      uVrot: { value: PARAMS.vrot },
      uPattern: { value: PARAMS.pattern },
      uViewportH: { value: 1 },
      uMaxPx: { value: 4 },
      uIntensity: { value: 1 },
    };

    // ── populations (additive) ──
    const L = makeLayer(count);
    const nBulge = Math.round(count * 0.15);
    const nDisk = Math.round(count * 0.5);
    const nHII = Math.round(count * 0.018);
    const nArm = count - nBulge - nDisk - nHII;
    const expo = (scale: number, lo: number, hi: number) => {
      for (;;) {
        const a = lo - scale * Math.log(1 - rand());
        if (a < hi) return a;
      }
    };
    // bulge: old, warm, triaxial-ish
    for (let i = 0; i < nBulge; i++) {
      const x = gaussian(rand) * 1.5;
      const z = gaussian(rand) * 1.2;
      const a = Math.hypot(x, z) + 0.02;
      const T = 2800 + 2200 * rand();
      push(L, a, Math.atan2(z, x), 0, gaussian(rand) * 0.55 * Math.exp(-a / 3), 0.03, 0.35 + 0.9 * Math.pow(rand(), 3), starColor(T));
    }
    // old thin disk: differential rotation, smooth
    for (let i = 0; i < nDisk; i++) {
      const a = expo(5.2, 1.2, 24);
      const T = 3100 + 3400 * Math.pow(rand(), 1.4);
      const u = rand();
      push(L, a, rand() * Math.PI * 2, 0, gaussian(rand) * (0.1 + 0.3 * Math.exp(-a / 3.5)), 0.03, 0.2 + 1.2 * Math.pow(u, 12) + 0.3 * Math.pow(u, 3), starColor(T));
    }
    // arm population: young, hot, concentrated along two trailing log spirals
    for (let i = 0; i < nArm; i++) {
      const arm = rand() < 0.5 ? 0 : 1;
      const a = expo(6.5, PARAMS.armA0 + 0.3, 22);
      const width = 0.42 + 0.07 * a;
      const k0 = rand();
      const spread = k0 < 0.55 ? 1 : k0 < 0.88 ? 2.2 : 4; // narrow ridge + broad skirt + spurs
      const phase = armAngle(a, arm) + (gaussian(rand) * width * spread) / a;
      const k = rand();
      const T = k < 0.55 ? 9000 + 19000 * rand() : k < 0.85 ? 6000 + 3000 * rand() : 4200 + 1800 * rand();
      const u = rand();
      push(L, a * Math.exp(gaussian(rand) * 0.04), phase, 1, gaussian(rand) * 0.06, 0.032, 0.25 + 2.4 * Math.pow(u, 10) + 0.5 * Math.pow(u, 3), starColor(T));
    }
    // H II regions: clumpy pink (Hα 656 nm) and blue reflection nebulae strung along the arms
    const clusters = Math.max(24, Math.round(nHII / 14));
    const centers: [number, number][] = [];
    for (let c = 0; c < clusters; c++) {
      const a = expo(6, 3, 19);
      centers.push([a, armAngle(a, c % 2) + (gaussian(rand) * 0.3) / a]);
    }
    for (let i = 0; i < nHII; i++) {
      const [ca, cp] = centers[i % clusters]!;
      const a = ca + gaussian(rand) * 0.22;
      const blue = rand() < 0.2;
      push(L, a, cp + (gaussian(rand) * 0.25) / ca, 1, gaussian(rand) * 0.05, 0.18 + 0.4 * rand(), 0.1 + 0.14 * rand(), blue ? [0.45, 0.62, 1.0] : [1.0, 0.2, 0.36]);
    }
    const starMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: starsVert,
      fragmentShader: starsFrag,
      uniforms: this.uniforms,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.stars = new Points(layerGeometry(L), starMat);
    this.stars.frustumCulled = false;

    // ── dust lanes: absorbing, on the concave (inner) edge of the arms ──
    const nDust = Math.round(count * 0.08);
    const D = makeLayer(nDust);
    for (let i = 0; i < nDust; i++) {
      const arm = rand() < 0.5 ? 0 : 1;
      const a = expo(6.5, 2.4, 19);
      const width = 0.3 + 0.05 * a;
      push(D, a, armAngle(a, arm) + 0.24 + (gaussian(rand) * width * (rand() < 0.7 ? 1 : 2)) / a, 1, gaussian(rand) * 0.04, 0.35 + 0.55 * rand(), 1, [0.012 + 0.02 * rand(), 0, 0]);
    }
    // ── unresolved starlight: a smooth surface-brightness map in the disk plane ──
    this.hazeUniforms = {
      uTime: this.uniforms.uTime,
      uPattern: this.uniforms.uPattern,
      uArmK: { value: ARM_K },
      uArmA0: { value: PARAMS.armA0 },
      uIntensity: { value: 0 },
    };
    const plane = new PlaneGeometry(60, 60, 1, 1);
    plane.rotateX(-Math.PI / 2);
    this.haze = new Mesh(
      plane,
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: diskVert,
        fragmentShader: diskFrag,
        uniforms: this.hazeUniforms,
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        side: DoubleSide,
      }),
    );
    this.haze.frustumCulled = false;

    const dustUniforms = { ...this.uniforms, uIntensity: { value: 1 }, uMaxPx: { value: 90 } };
    const dustMat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: starsVert,
      fragmentShader: dustFrag,
      uniforms: dustUniforms,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: ZeroFactor,
      blendDst: OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.dust = new Points(layerGeometry(D), dustMat);
    this.dust.frustumCulled = false;

    // ── distant background stars ──
    const nBg = 5000;
    const bgGeo = new BufferGeometry();
    const bgPos = new Float32Array(nBg * 3);
    const bgCol = new Float32Array(nBg * 3);
    for (let i = 0; i < nBg; i++) {
      const z = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      bgPos.set([s * Math.cos(t) * 1500, z * 1500, s * Math.sin(t) * 1500], i * 3);
      const c = starColor(3500 + 7000 * rand());
      const b = 0.05 + 0.6 * Math.pow(rand(), 8);
      bgCol.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    bgGeo.setAttribute('position', new BufferAttribute(bgPos, 3));
    bgGeo.setAttribute('aColor', new BufferAttribute(bgCol, 3));
    this.background = new Points(
      bgGeo,
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: `in vec3 aColor; out vec3 vColor; uniform float uFade; void main(){ vColor = aColor * uFade; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 1.6; }`,
        fragmentShader: `in vec3 vColor; out vec4 fragColor; void main(){ vec2 c = gl_PointCoord*2.0-1.0; float d = dot(c,c); if (d>1.0) discard; fragColor = vec4(vColor, exp(-d*3.0)); }`,
        uniforms: { uFade: { value: 1 } },
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.background.frustumCulled = false;

    // ── deep field: faint, distant galaxies of every shape and inclination ──
    const nDeep = 140;
    const dGeo = new BufferGeometry();
    const dPos = new Float32Array(nDeep * 3);
    const dCol = new Float32Array(nDeep * 3);
    const dShape = new Float32Array(nDeep * 3); // size px, axis ratio, position angle
    for (let i = 0; i < nDeep; i++) {
      const z = rand() * 2 - 1;
      const t = rand() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      dPos.set([s * Math.cos(t) * 1400, z * 1400, s * Math.sin(t) * 1400], i * 3);
      const elliptical = rand() < 0.35;
      const c = elliptical ? starColor(3600 + 900 * rand()) : starColor(5200 + 5000 * rand());
      const b = 0.05 + 0.18 * Math.pow(rand(), 3);
      dCol.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
      dShape.set([2.5 + 9 * Math.pow(rand(), 3), elliptical ? 0.55 + 0.4 * rand() : 0.15 + 0.6 * rand(), rand() * Math.PI], i * 3);
    }
    dGeo.setAttribute('position', new BufferAttribute(dPos, 3));
    dGeo.setAttribute('aColor', new BufferAttribute(dCol, 3));
    dGeo.setAttribute('aShape', new BufferAttribute(dShape, 3));
    this.deepField = new Points(
      dGeo,
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: `in vec3 aColor; in vec3 aShape; out vec3 vColor; out vec3 vShape; uniform float uFade; uniform float uDpr;
          void main(){ vColor = aColor * uFade; vShape = aShape; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aShape.x * uDpr; }`,
        fragmentShader: `in vec3 vColor; in vec3 vShape; out vec4 fragColor;
          void main(){
            vec2 c = gl_PointCoord * 2.0 - 1.0;
            float a = vShape.z; c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c; c.y /= vShape.y;
            float d = dot(c, c); if (d > 1.0) discard;
            float core = exp(-d * 9.0) + 0.35 * exp(-d * 2.5);
            fragColor = vec4(vColor * core, 1.0);
          }`,
        uniforms: { uFade: { value: 1 }, uDpr: { value: 1 } },
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.deepField.frustumCulled = false;

    const glowMat = (color: [number, number, number], core: number) =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: glowVert,
        fragmentShader: glowFrag,
        uniforms: { uScale: { value: 1 }, uColor: { value: new Vector3(...color) }, uIntensity: { value: 1 }, uCore: { value: core } },
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
    this.core = new Mesh(new PlaneGeometry(1, 1), glowMat([1.0, 0.78, 0.52], 26));
    this.core.frustumCulled = false;
    const sun = starColor(5800);
    this.hero = new Mesh(new PlaneGeometry(1, 1), glowMat([sun[0], sun[1], sun[2]], 140));
    this.hero.frustumCulled = false;

    this.scene.add(this.deepField, this.background, this.haze, this.stars, this.dust, this.core, this.hero);
    this.dust.renderOrder = 1;
    this.core.renderOrder = 2;
    this.hero.renderOrder = 3;
  }

  /** camera distance as a function of zoom progress (log-space pull-back) */
  private distanceFor(z: number) {
    if (z <= Z_STAR) return D_NEAR;
    const u = easeInOutCubic(clamp((z - Z_STAR) / (1 - Z_STAR)));
    // portrait screens need to back off further to fit the disk's width
    const far = D_FAR * Math.max(1, 1.3 / (this.cssW / this.cssH));
    return Math.exp(lerp(Math.log(D_NEAR), Math.log(far), u));
  }

  update(f: FrameInfo) {
    const z = this.zoom;
    this.uniforms.uTime.value = f.time;
    this.uniforms.uViewportH.value = f.bufferHeight;
    this.uniforms.uMaxPx.value = 3.6 * f.dpr;
    this.uniforms.uIntensity.value = 0.9 * this.weight * (180_000 / Math.max(this.stars.geometry.drawRange.count, 1)) ** 0.5;
    (this.dust.material.uniforms.uMaxPx as { value: number }).value = 60 * f.dpr;
    (this.dust.material.uniforms.uIntensity as { value: number }).value = smoothstep(0.35, 0.7, z) * this.weight;
    (this.background.material.uniforms.uFade as { value: number }).value = this.weight;
    const df = this.deepField.material.uniforms as { uFade: { value: number }; uDpr: { value: number } };
    df.uFade.value = this.weight;
    df.uDpr.value = f.dpr;

    galaxyOrbit(HERO.a, HERO.phase, f.time, this.heroPos);

    const targetDist = this.distanceFor(z);
    this.dist = Math.exp(lerp(Math.log(this.dist), Math.log(targetDist), damp(5, f.dt)));
    // Everything keys off log-distance: stay in the plane while inside the disk, tilt only once
    // outside it, and re-centre on the core only at galactic scale.
    const ld = Math.log(this.dist);
    const toCenter = smoothstep(Math.log(1.2), Math.log(36), ld);
    this.target.copy(this.heroPos).multiplyScalar(1 - toCenter);
    const elev = lerp(2, 52, smoothstep(Math.log(0.35), Math.log(30), ld)) * DEG + f.pointer.y * 0.05;
    const az = -0.9 + f.time * 0.008 + f.pointer.x * 0.12;
    this.camera.position.set(
      this.target.x + this.dist * Math.cos(elev) * Math.cos(az),
      this.target.y + this.dist * Math.sin(elev),
      this.target.z + this.dist * Math.cos(elev) * Math.sin(az),
    );
    this.camera.lookAt(this.target);
    this.camera.near = Math.max(this.dist * 0.02, 0.0002);
    this.camera.far = 4000;
    this.heroFade = 1 - smoothstep(Math.log(0.03), Math.log(0.4), ld);
    // the plane is only meaningful from outside the disk (edge-on from inside it would be a line)
    this.hazeUniforms.uIntensity!.value = 0.28 * smoothstep(Math.log(2), Math.log(20), ld) * this.weight;

    // composition: drift the galaxy right of the contact copy at the end (desktop)
    const wide = this.cssW / this.cssH > 1.1;
    const settle = smoothstep(0.75, 1, z);
    const sx = wide ? lerp(0.5, 0.64, settle) : 0.5;
    const sy = wide ? 0.5 : lerp(0.5, 0.36, settle);
    this.stageX += (sx - this.stageX) * damp(4, f.dt);
    this.stageY += (sy - this.stageY) * damp(4, f.dt);
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.setViewOffset(this.cssW, this.cssH, -(this.stageX - 0.5) * this.cssW, -(this.stageY - 0.5) * this.cssH, this.cssW, this.cssH);
    this.camera.updateProjectionMatrix();

    // core glow grows in as the whole galaxy comes into view
    const cu = this.core.material.uniforms;
    cu.uScale!.value = 6.5;
    cu.uIntensity!.value = 0.38 * smoothstep(0.45, 0.9, z) * this.weight;

    // the "hero" star we zoomed out from: a Sun-like G2V point
    const hu = this.hero.material.uniforms;
    this.hero.position.copy(this.heroPos);
    hu.uScale!.value = Math.max(this.dist * 0.07, 0.0004);
    hu.uIntensity!.value = 1.8 * this.heroFade * smoothstep(0.1, 0.2, z) * this.weight;
    this.hero.visible = hu.uIntensity!.value > 1e-3;
  }

  draw(renderer: WebGLRenderer) {
    renderer.render(this.scene, this.camera);
  }

  resize(_bw: number, _bh: number, cw: number, ch: number) {
    this.cssW = cw;
    this.cssH = ch;
  }

  fieldOfViewLog10() {
    const width = (d: number) => Math.log10(2 * d * Math.tan((this.camera.fov * DEG) / 2) * (this.cssW / this.cssH) * UNIT_M);
    const z = this.zoom;
    if (z < Z_STAR) return lerp(-8.7, width(D_NEAR), smoothstep(0.02, Z_STAR, z));
    return width(this.distanceFor(z));
  }

  readouts(): Readout[] {
    const { readouts: r, units: u } = UI[this.loc];
    return [
      [r.vrot, `≈ 220 ${u.kms} · ${r.flat}`],
      [r.radius, `≈ 50 ${u.kly}`],
      [r.arms, r.densityWave],
    ];
  }

  dispose() {
    for (const o of [this.stars, this.dust, this.background, this.deepField, this.haze]) {
      o.geometry.dispose();
      o.material.dispose();
    }
    for (const m of [this.core, this.hero]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
