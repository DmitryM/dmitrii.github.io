import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  ClampToEdgeWrapping,
  FloatType,
  NearestFilter,
  CubeCamera,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderTarget,
  type DataTexture,
  type WebGLRenderer,
} from 'three';
import type { Chapter, FrameInfo, Readout } from '../../Chapter';
import type { Tier } from '../../Quality';
import { FullscreenPass, clamp, damp, keyframes, lerp, smoothstep } from '../../util';
import { clockRate, schwarzschildRadiusMeters } from '../../../physics/schwarzschild';
import { UI, clientLocale, num } from '../../../i18n/index.ts';
import blackholeFrag from './blackhole.frag';
import skyVert from './sky.vert';
import skyFrag from './sky-bake.frag';
import diskNoiseFrag from './disk-noise.frag';
import compositeFrag from './composite.frag';

const RS_METERS = schwarzschildRadiusMeters(6.5e9);
const DEG = Math.PI / 180;

export interface ObservatoryParams {
  lensing: boolean;
  doppler: boolean;
  redshift: boolean;
  temperature: number;
  inclination: number; // degrees from the disk axis
  distance: number; // r_s
}

export class BlackHole implements Chapter {
  readonly name = 'blackhole';
  weight = 1;
  /** scroll progress through chapters I–II, 0…1 */
  progress = 0;
  /** dynamic resolution scale (≤ tier.bhScale) */
  scale: number;
  /** NDC offset of the hole's centre (composition) */
  readonly lensShift = new Vector2();

  // observatory
  observing = false;
  readonly observatory: ObservatoryParams = { lensing: true, doppler: true, redshift: true, temperature: 5400, inclination: 84, distance: 26 };
  private obsBlend = 0;
  private obsAz = 0;
  private toggles = { lensing: 1, doppler: 1, redshift: 1, temperature: 5400 };

  private readonly trace: FullscreenPass;
  private readonly upsample: FullscreenPass;
  private target: WebGLRenderTarget;
  private skyTarget: WebGLCubeRenderTarget;
  private noiseTarget: WebGLRenderTarget;

  private bufferW = 1;
  private bufferH = 1;
  private cssW = 1;
  private cssH = 1;

  // camera state
  private r = 26;
  private incl = 84 * DEG;
  private az = 0;
  private roll = 0;
  private tanHalfFov = Math.tan(22 * DEG);
  private readonly camPos = new Vector3();
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private time = 0;
  private readonly loc = clientLocale();

  constructor(
    private readonly renderer: WebGLRenderer,
    tier: Tier,
    lut: DataTexture,
  ) {
    this.scale = tier.bhScale;
    // MRT: [0] disk emission + sky visibility (half float, filtered), [1] escaped ray direction (float, exact)
    this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, count: 2 });
    const dirTex = this.target.textures[1]!;
    dirTex.type = FloatType;
    dirTex.minFilter = NearestFilter;
    dirTex.magFilter = NearestFilter;
    this.skyTarget = new WebGLCubeRenderTarget(512, {
      type: HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    });
    this.noiseTarget = new WebGLRenderTarget(1024, 256, {
      type: HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      wrapS: RepeatWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
    });
    this.noiseTarget.texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());

    this.trace = new FullscreenPass({
      fragmentShader: blackholeFrag,
      defines: { MAX_STEPS: tier.bhSteps, DISK_SAMPLES: tier.diskSamples },
      uniforms: {
        uResolution: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uCamPos: { value: this.camPos },
        uCamRight: { value: this.right },
        uCamUp: { value: this.up },
        uCamFwd: { value: this.fwd },
        uTanHalfFov: { value: this.tanHalfFov },
        uLensShift: { value: this.lensShift },
        uDiskNoise: { value: this.noiseTarget.texture },
        uBlackbody: { value: lut },
        uDiskInner: { value: 3 },
        uDiskOuter: { value: 15 },
        uDiskTemp: { value: 5400 },
        uDiskSpeed: { value: 4.2 },
        uLensing: { value: 1 },
        uDoppler: { value: 1 },
        uRedshift: { value: 1 },
        uExposure: { value: 1 },
      },
    });
    this.upsample = new FullscreenPass({
      fragmentShader: compositeFrag,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: this.target.textures[0] },
        uDir: { value: this.target.textures[1] },
        uTexSize: { value: new Vector2(1, 1) },
        uWeight: { value: 1 },
        uSkyWeight: { value: 1 },
        uSky: { value: this.skyTarget.texture },
        uBlackbody: { value: lut },
        uStarExposure: { value: 1 },
        uSkyExposure: { value: 1 },
      },
    });
  }

  /** One-off GPU bakes: sky cube map and tileable disk turbulence. Re-run after context loss. */
  bake() {
    const r = this.renderer;
    const skyScene = new Scene();
    const skyMat = new ShaderMaterial({ glslVersion: GLSL3, vertexShader: skyVert, fragmentShader: skyFrag, side: BackSide, depthWrite: false });
    const box = new Mesh(new BoxGeometry(2, 2, 2), skyMat);
    skyScene.add(box);
    const cubeCam = new CubeCamera(0.1, 10, this.skyTarget);
    cubeCam.update(r, skyScene);
    box.geometry.dispose();
    skyMat.dispose();

    const noise = new FullscreenPass({ fragmentShader: diskNoiseFrag });
    noise.render(r, this.noiseTarget);
    noise.dispose();
    r.setRenderTarget(null);
  }

  /** Swap tracer step count / disk samples (recompiles the program). */
  setQuality(tier: Tier) {
    const m = this.trace.material;
    m.defines.MAX_STEPS = tier.bhSteps;
    m.defines.DISK_SAMPLES = tier.diskSamples;
    m.needsUpdate = true;
    this.scale = Math.min(this.scale, tier.bhScale);
  }

  /** The tracer material, for async pre-compilation and benchmarking. */
  get traceScene() {
    return { scene: this.trace.scene, camera: this.trace.camera };
  }

  /** Render the tracer once into a small target (used by the GPU benchmark). */
  benchmarkFrame(target: WebGLRenderTarget) {
    this.updateCamera(0);
    this.trace.material.uniforms.uResolution!.value.set(target.width, target.height);
    this.trace.render(this.renderer, target);
  }

  /** Whether the current frame is dominated by the hero (for the observe button). */
  get inHero() {
    return this.progress < 0.42;
  }

  setObserving(on: boolean) {
    if (on && !this.observing) {
      this.observatory.inclination = this.incl / DEG;
      this.observatory.distance = this.r;
      this.obsAz = this.az;
    }
    this.observing = on;
  }

  /** Drag / wheel input while observing. */
  orbit(dx: number, dy: number) {
    this.obsAz -= dx * 0.005;
    this.observatory.inclination = clamp(this.observatory.inclination - dy * 0.18, 1, 89);
  }
  zoom(factor: number) {
    this.observatory.distance = clamp(this.observatory.distance * factor, 4, 60);
  }

  private updateCamera(dt: number, pointerX = 0, pointerY = 0) {
    const p = this.progress;
    const portrait = this.cssW / this.cssH < 0.9;

    // scroll path (log-space radius for a constant-feeling fall)
    const lnR = keyframes(
      [
        [0, Math.log(portrait ? 30 : 26)],
        [0.3, Math.log(18.5)],
        [0.62, Math.log(9)],
        [0.86, Math.log(3.1)],
        [1, Math.log(1.22)],
      ],
      p,
    );
    let r = Math.exp(lnR);
    let incl =
      keyframes(
        [
          [0, 84.5],
          [0.3, 80],
          [0.62, 71],
          [0.86, 79],
          [1, 87],
        ],
        p,
      ) * DEG;
    let az = keyframes(
      [
        [0, 0],
        [1, 2.1],
      ],
      p,
    );
    az += this.time * 0.01 + pointerX * 0.09;
    incl += -pointerY * 0.045;
    let roll = keyframes(
      [
        [0, -7],
        [0.5, -3],
        [1, 8],
      ],
      p,
    ) * DEG;

    // observatory override (damped)
    this.obsBlend += ((this.observing ? 1 : 0) - this.obsBlend) * damp(3.2, dt);
    if (this.obsBlend > 1e-3) {
      const o = this.observatory;
      const b = smoothstep(0, 1, this.obsBlend);
      r = Math.exp(lerp(Math.log(r), Math.log(o.distance), b));
      incl = lerp(incl, o.inclination * DEG, b);
      az = lerp(az, this.obsAz, b);
      roll = lerp(roll, -4 * DEG, b);
    }
    // smooth the camera itself so scroll jumps never teleport it
    const k = dt > 0 ? damp(6, dt) : 1;
    this.r += (r - this.r) * k;
    this.incl += (incl - this.incl) * k;
    this.az += (az - this.az) * k;
    this.roll += (roll - this.roll) * k;

    const st = Math.sin(this.incl);
    this.camPos.set(this.r * st * Math.cos(this.az), this.r * Math.cos(this.incl), this.r * st * Math.sin(this.az));
    this.fwd.copy(this.camPos).multiplyScalar(-1).normalize();
    const worldUp = new Vector3(0, 1, 0);
    this.right.crossVectors(this.fwd, worldUp).normalize();
    this.up.crossVectors(this.right, this.fwd).normalize();
    // Final plunge: turn to look back out. Inside the photon sphere the whole visible universe
    // is squeezed into a shrinking bright window opposite the hole.
    const turn = smoothstep(0.8, 1, this.progress) * (1 - smoothstep(0, 1, this.obsBlend)) * Math.PI * 0.98;
    if (turn > 1e-4) {
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const f0 = this.fwd.clone();
      this.fwd.multiplyScalar(c).addScaledVector(this.right, s).normalize();
      this.right.multiplyScalar(c).addScaledVector(f0, -s).normalize();
    }
    if (this.roll !== 0) {
      const c = Math.cos(this.roll);
      const s = Math.sin(this.roll);
      const rx = this.right.clone();
      this.right.multiplyScalar(c).addScaledVector(this.up, s);
      this.up.multiplyScalar(c).addScaledVector(rx, -s);
    }

    // composition: hero places the hole right of centre (desktop) or high (portrait)
    const hero = 1 - smoothstep(0.18, 0.55, p);
    const obs = smoothstep(0, 1, this.obsBlend);
    const sx = portrait ? 0 : 0.3 * hero * (1 - obs) - 0.12 * obs * (this.cssW > 900 ? 1 : 0);
    const sy = portrait ? 0.3 * hero * (1 - obs) + 0.18 * obs : 0.04 * hero;
    this.lensShift.set(sx, sy);

    const aspect = this.cssW / this.cssH;
    this.tanHalfFov = clamp(Math.tan(30 * DEG) / aspect, Math.tan(21 * DEG), Math.tan(36 * DEG));
  }

  update(frame: FrameInfo) {
    this.time = frame.time;
    this.updateCamera(frame.dt, frame.pointer.x, frame.pointer.y);

    const o = this.observatory;
    const k = damp(4, frame.dt);
    const tg = this.toggles;
    const on = (v: boolean) => (v || this.obsBlend < 0.02 ? 1 : 0);
    tg.lensing += (on(o.lensing) - tg.lensing) * k;
    tg.doppler += (on(o.doppler) - tg.doppler) * k;
    tg.redshift += (on(o.redshift) - tg.redshift) * k;
    tg.temperature += ((this.observing ? o.temperature : 5400) - tg.temperature) * k;

    const u = this.trace.material.uniforms;
    u.uTime!.value = frame.time;
    u.uTanHalfFov!.value = this.tanHalfFov;
    u.uLensing!.value = tg.lensing;
    u.uDoppler!.value = tg.doppler;
    u.uRedshift!.value = tg.redshift;
    u.uDiskTemp!.value = tg.temperature;
    // brighten slightly while diving so the photon ring carries the frame
    u.uExposure!.value = 1 + 0.6 * smoothstep(0.7, 1, this.progress);
  }

  prepare(renderer: WebGLRenderer) {
    const w = Math.max(2, Math.round(this.bufferW * this.scale));
    const h = Math.max(2, Math.round(this.bufferH * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.trace.material.uniforms.uResolution!.value.set(w, h);
    this.trace.render(renderer, this.target);
  }

  draw(renderer: WebGLRenderer) {
    const u = this.upsample.material.uniforms;
    u.uTexSize!.value.set(this.target.width, this.target.height);
    u.uWeight!.value = this.weight;
    renderer.render(this.upsample.scene, this.upsample.camera);
  }

  resize(bw: number, bh: number, cw: number, ch: number) {
    this.bufferW = bw;
    this.bufferH = bh;
    this.cssW = cw;
    this.cssH = ch;
  }

  /** camera distance r in r_s */
  get radius() {
    return this.r;
  }

  fieldOfViewLog10() {
    const aspect = this.cssW / this.cssH;
    const width = 2 * this.r * this.tanHalfFov * aspect;
    return Math.log10(width * RS_METERS);
  }

  readouts(): Readout[] {
    const r = this.r;
    const l = this.loc;
    return [
      ['r', `${num(r, r < 10 ? 2 : 1, l)} r_s`],
      ['i', `${num(this.incl / DEG, 1, l)}°`],
      [UI[l].readouts.clock, `${num(clockRate(r), 3, l)} t∞`],
      ['M', `${num(6.5, 1, l)}×10⁹ M☉`],
    ];
  }

  dispose() {
    this.trace.dispose();
    this.upsample.dispose();
    this.target.dispose();
    this.skyTarget.dispose();
    this.noiseTarget.dispose();
  }
}
