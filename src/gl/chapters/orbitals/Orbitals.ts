import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector3,
  Matrix4,
  type WebGLRenderer,
} from 'three';
import type { Chapter, FrameInfo, Readout } from '../../Chapter';
import { clamp, damp, lerp, smoothstep } from '../../util';
import { meanRadius, orbitalSubscript, type OrbitalState } from '../../../physics/hydrogen';
import { wavelengthColor } from '../../../physics/blackbody';
import { band, formatWavelength, levelEnergy, lineName, transitionWavelength } from '../../../physics/spectra';
import { UI, clientLocale, num } from '../../../i18n/index.ts';
import type { OrbitalBuffers } from './sampler.worker';
import particlesVert from './particles.vert';
import particlesFrag from './particles.frag';
import photonVert from './photon.vert';
import photonFrag from './photon.frag';
import ringFrag from './ring.frag';
import glowVert from '../galaxy/glow.vert';
import glowFrag from '../galaxy/glow.frag';

const A0 = 5.29177210903e-11; // Bohr radius [m]
const DEG = Math.PI / 180;

export interface RoleState {
  state: OrbitalState;
  label: string;
}

/** Eigenstates are declared in the markup (rendered from site.ts) as data attributes. */
export function readOrbitalStates(): RoleState[] {
  return [...document.querySelectorAll<HTMLElement>('.role[data-n]')].slice(0, 5).map((el) => ({
    state: { n: Number(el.dataset.n), l: Number(el.dataset.l), m: Number(el.dataset.m) },
    label: el.querySelector('.role__orbital')?.textContent?.trim() ?? '',
  }));
}

/** preferred camera elevation per orbital shape, so each one is seen at its most legible angle */
function preferredElevation(s: OrbitalState): number {
  if (s.l === 2 && Math.abs(s.m) === 2) return 64; // d_xy / d_x²−y² lie in the equatorial plane
  if (s.l === 1 && s.m !== 0) return 16;
  if (s.l === 3) return 30;
  return 24;
}

export class Orbitals implements Chapter {
  readonly name = 'orbitals';
  weight = 0;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(38, 1, 0.1, 2000);

  private readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly photon: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly nucleus: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly ring: Mesh<PlaneGeometry, ShaderMaterial>;
  private burst = 1;
  private pulse = 0;
  private readonly radii: number[];
  private readonly elevations: number[];

  private entry = 0;
  private state = 0;
  private zoom = 0;
  private cssW = 1;
  private cssH = 1;
  private bufferH = 1;
  private dpr = 1;
  private dist = 40;
  private elev = 24;
  private az = 0.6;
  private stage = { x: 0.5, y: 0.5, w: 600 };
  private stageEl: HTMLElement | null;
  private time = 0;
  private readonly loc = clientLocale();

  constructor(
    private readonly roles: RoleState[],
    buffers: OrbitalBuffers,
    count: number,
  ) {
    const n = roles.length + 1;
    const geo = new BufferGeometry();
    buffers.positions.slice(0, n).forEach((p, i) => geo.setAttribute(`aS${i}`, new BufferAttribute(p, 3)));
    geo.setAttribute('aSigns', new BufferAttribute(buffers.signs, 1));
    geo.setAttribute('aSeed', new BufferAttribute(buffers.seeds, 1));
    geo.setDrawRange(0, count);
    // three needs a `position` attribute for bounds; reuse the first state (culling is disabled anyway)
    geo.setAttribute('position', geo.getAttribute('aS1') ?? geo.getAttribute('aS0'));

    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: particlesVert,
      fragmentShader: particlesFrag,
      defines: { NUM_STATES: n },
      uniforms: {
        uState: { value: 0 },
        uTime: { value: 0 },
        uPointPx: { value: 1.6 },
        uCamDist: { value: 100 },
        uViewportH: { value: 1 },
        uShrink: { value: 1 },
        uIntensity: { value: 0 },
        uFlight: { value: 1 },
        uBurst: { value: 0 },
        uPulse: { value: 0 },
        uColorPos: { value: new Vector3(1.0, 0.5, 0.17) },
        uColorNeg: { value: new Vector3(0.16, 0.52, 1.0) },
        uColorVac: { value: new Vector3(0.55, 0.62, 0.85) },
      },
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.points = new Points(geo, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.photon = new Mesh(
      new PlaneGeometry(1, 1, 480, 1),
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: photonVert,
        fragmentShader: photonFrag,
        uniforms: {
          uLength: { value: 40 },
          uAmp: { value: 1.6 },
          uThick: { value: 0.22 },
          uCenter: { value: 0 },
          uWidth: { value: 0.12 },
          uWavelength: { value: 0.05 },
          uTime: { value: 0 },
          uColor: { value: new Vector3(1, 0.1, 0.1) },
          uIntensity: { value: 0 },
        },
        blending: AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.photon.frustumCulled = false;
    this.photon.visible = false;
    this.scene.add(this.photon);

    // the proton: a tiny, very bright point at the centre of every eigenstate
    const billboard = (frag: string, uniforms: Record<string, { value: unknown }>) => {
      const m = new Mesh(
        new PlaneGeometry(1, 1),
        new ShaderMaterial({ glslVersion: GLSL3, vertexShader: glowVert, fragmentShader: frag, uniforms, blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }),
      );
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.nucleus = billboard(glowFrag, { uScale: { value: 1 }, uColor: { value: new Vector3(1, 0.9, 0.85) }, uIntensity: { value: 0 }, uCore: { value: 260 } });
    this.ring = billboard(ringFrag, { uScale: { value: 1 }, uColor: { value: new Vector3(1, 0.2, 0.2) }, uRadius: { value: 0 }, uWidth: { value: 0.02 }, uIntensity: { value: 0 } });
    this.ring.visible = false;

    this.radii = roles.map((r) => meanRadius(r.state.n, r.state.l));
    this.elevations = roles.map((r) => preferredElevation(r.state));
    this.stageEl = document.querySelector('[data-orbital-stage]');
  }

  /** Make every mesh visible so pre-compilation covers programs that only appear mid-journey. */
  showAllForCompile() {
    this.photon.visible = true;
    this.ring.visible = true;
    this.nucleus.visible = true;
  }

  setJourney(entry: number, state: number, zoom: number, burst = 1) {
    this.burst = burst;
    this.entry = entry;
    this.state = state;
    this.zoom = zoom;
  }

  /** continuous index into roles (0…n−1) */
  private get roleIndex() {
    return clamp(this.state - 1, 0, this.roles.length - 1);
  }

  private readStage() {
    const el = this.stageEl;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const visible = getComputedStyle(el).visibility !== 'hidden' && r.width > 40;
    if (visible) {
      this.stage.x = (r.left + r.width / 2) / this.cssW;
      this.stage.y = 0.5;
      this.stage.w = r.width;
    } else {
      this.stage.x = 0.5;
      this.stage.y = this.cssW < 760 ? 0.42 : 0.5;
      this.stage.w = this.cssW < 760 ? this.cssW * 1.05 : this.cssW * 0.55;
    }
  }

  update(f: FrameInfo) {
    this.time = f.time;
    const u = this.points.material.uniforms;
    u.uState!.value = this.state;
    u.uBurst!.value = this.burst;
    u.uTime!.value = f.time;
    u.uViewportH!.value = this.bufferH;
    u.uPointPx!.value = 1.5 * this.dpr;

    // scale: interpolate mean radii in the same eased way the particles move
    const ri = this.roleIndex;
    const i = Math.floor(ri);
    const t = ri - i;
    const e = t * t * (3 - 2 * t);
    const rMean = lerp(this.radii[i]!, this.radii[Math.min(i + 1, this.radii.length - 1)]!, e);
    const elevT = lerp(this.elevations[i]!, this.elevations[Math.min(i + 1, this.elevations.length - 1)]!, e);

    // zoom-out: the atom collapses to a point which becomes a star
    const shrink = Math.pow(1 - smoothstep(0, 0.2, this.zoom), 2.2);
    u.uShrink!.value = Math.max(shrink, 0.002);
    u.uFlight!.value = 1;

    // camera: frame the cloud's visual extent (~95th radial percentile ≈ 1.65⟨r⟩) inside the stage
    const aspect = this.cssW / this.cssH;
    this.readStage();
    const halfFov = Math.tan((this.camera.fov * DEG) / 2);
    const targetPx = Math.max(140, 0.4 * Math.min(this.stage.w, this.cssH));
    const fit = ((1.65 * rMean) / halfFov) * (this.cssH / 2 / targetPx);
    const targetDist = fit * (1 + 0.25 * (1 - smoothstep(0, 1, this.entry)));
    const k = damp(4, f.dt);
    this.dist += (targetDist - this.dist) * k;
    this.elev += (elevT + f.pointer.y * 6 - this.elev) * k;
    this.az = 0.6 + f.time * 0.05 + f.pointer.x * 0.25;
    const el = this.elev * DEG;
    this.camera.position.set(this.dist * Math.cos(el) * Math.cos(this.az), this.dist * Math.sin(el), this.dist * Math.cos(el) * Math.sin(this.az));
    u.uCamDist!.value = this.dist;
    this.camera.lookAt(0, 0, 0);

    // the vacuum fills the whole frame; the condensed atom moves into its stage
    const settle = smoothstep(0.2, 1, this.entry) * (1 - smoothstep(0, 0.1, this.zoom));
    const offX = -(this.stage.x - 0.5) * this.cssW * settle;
    const offY = -(this.stage.y - 0.5) * this.cssH * settle;
    this.camera.setViewOffset(this.cssW, this.cssH, offX, offY, this.cssW, this.cssH);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    // overall fade
    u.uIntensity!.value = this.baseIntensity() * this.weight;

    this.updatePhoton(rMean);
    u.uPulse!.value = this.pulse;

    // nucleus: visible once the atom has formed, flares with each jump
    const nu = this.nucleus.material.uniforms;
    nu.uScale!.value = this.dist * 0.035;
    nu.uIntensity!.value = (0.5 + 2.2 * this.pulse) * smoothstep(0.5, 1, this.entry) * this.weight * shrink;
  }

  private baseIntensity() {
    const count = this.points.geometry.drawRange.count;
    return 0.36 * (200_000 / Math.max(count, 1)) * (0.65 + 0.35 * smoothstep(0, 1, this.entry));
  }

  /** wave packet emitted during each downward transition (k → k+1) */
  private updatePhoton(rMean: number) {
    const ri = this.roleIndex;
    const seg = Math.floor(ri);
    const t = ri - seg;
    const pu = this.photon.material.uniforms;
    if (this.state < 1 || seg >= this.roles.length - 1 || t < 0.28 || t > 0.999) {
      this.photon.visible = false;
      this.ring.visible = false;
      this.pulse = 0;
      return;
    }
    const upper = this.roles[seg]!.state.n;
    const lower = this.roles[seg + 1]!.state.n;
    const lambda = transitionWavelength(upper, lower);
    const { rgb } = wavelengthColor(lambda);
    const visible = band(lambda) === 'visible';
    const p = (t - 0.28) / 0.72;
    const L = rMean * 4.2;
    pu.uLength!.value = L;
    pu.uCenter!.value = lerp(0.04, 1.1, p);
    pu.uWidth!.value = 0.14;
    pu.uAmp!.value = rMean * 0.09;
    pu.uThick!.value = rMean * 0.024;
    pu.uWavelength!.value = clamp(0.045 * (lambda / 656), 0.03, 0.2);
    pu.uTime!.value = this.time;
    const c = visible ? rgb : [0.85, 0.05, 0.12];
    (pu.uColor!.value as Vector3).set(c[0]!, c[1]!, c[2]!);
    pu.uIntensity!.value = (visible ? 6 : 3) * Math.sin(Math.PI * clamp(p * 1.1)) * this.weight;

    // orient in the camera plane, heading up-right on screen
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const fwd = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2);
    const dir = right.clone().multiplyScalar(0.92).addScaledVector(up, 0.38).normalize();
    const side = new Vector3().crossVectors(fwd, dir).normalize();
    const m = new Matrix4().makeBasis(dir, side, fwd);
    this.photon.quaternion.copy(new Quaternion().setFromRotationMatrix(m));
    this.photon.position.set(0, 0, 0);
    this.photon.visible = true;

    // the jump: the cloud and nucleus flare, and a spherical wavefront races outward
    this.pulse = 0.9 * Math.exp(-Math.pow((t - 0.42) / 0.1, 2)) * (visible ? 1 : 0.7);
    const rw = clamp((t - 0.36) / 0.64);
    const ru = this.ring.material.uniforms;
    ru.uScale!.value = rMean * 5.5;
    ru.uRadius!.value = 0.04 + 0.92 * (1 - Math.pow(1 - rw, 2));
    ru.uWidth!.value = 0.006 + 0.014 * rw;
    ru.uIntensity!.value = (visible ? 0.6 : 0.35) * Math.pow(1 - rw, 2) * smoothstep(0, 0.06, rw) * this.weight;
    (ru.uColor!.value as Vector3).set(c[0]!, c[1]!, c[2]!);
    this.ring.visible = rw > 0 && rw < 1;
    const nc = this.nucleus.material.uniforms.uColor!.value as Vector3;
    nc.set(1, 0.9, 0.85).lerp(new Vector3(c[0]!, c[1]!, c[2]!), Math.min(1, this.pulse));
  }

  draw(renderer: WebGLRenderer) {
    renderer.render(this.scene, this.camera);
  }

  resize(_bw: number, bh: number, cw: number, ch: number) {
    this.cssW = cw;
    this.cssH = ch;
    this.bufferH = bh;
    this.dpr = bh / ch;
  }

  fieldOfViewLog10() {
    const width = 2 * this.dist * Math.tan((this.camera.fov * DEG) / 2) * (this.cssW / this.cssH);
    return Math.log10(width * A0);
  }

  readouts(): Readout[] {
    const ri = this.roleIndex;
    const idx = Math.round(ri);
    const s = this.roles[idx]!.state;
    const out: Readout[] = [
      ['ψ', `${this.roles[idx]!.label.replace(orbitalSubscript(s.l, s.m), '')}<sub>${orbitalSubscript(s.l, s.m)}</sub>`],
      ['n l m', `${s.n} ${s.l} ${s.m < 0 ? '−' + Math.abs(s.m) : s.m}`],
      ['E', `${num(levelEnergy(s.n), 2, this.loc)} ${UI[this.loc].eV}`],
      ['⟨r⟩', `${num(meanRadius(s.n, s.l), 1, this.loc)} a₀`],
    ];
    const seg = Math.floor(ri);
    const t = ri - seg;
    if (t > 0.05 && t < 0.95 && seg < this.roles.length - 1) {
      const a = this.roles[seg]!.state.n;
      const b = this.roles[seg + 1]!.state.n;
      const lam = transitionWavelength(a, b);
      out.push(['γ', `${lineName(a, b, this.loc)} · ${formatWavelength(lam, this.loc)}`]);
    }
    return out;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
    for (const m of [this.photon, this.nucleus, this.ring]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
