import {
  DataTexture,
  HalfFloatType,
  LinearFilter,
  NoToneMapping,
  RGBAFormat,
  SRGBColorSpace,
  WebGLRenderTarget,
  WebGLRenderer,
  DataUtils,
  ClampToEdgeWrapping,
} from 'three';
import type { Chapter, FrameInfo, Readout } from '../gl/Chapter';
import { Composer } from '../gl/Composer';
import { Director } from '../gl/Director';
import { DynamicResolution, TIERS, guessTier, isTierName, lowerTier, timeGpu, type Tier, type TierName } from '../gl/Quality';
import { BlackHole } from '../gl/chapters/blackhole/BlackHole';
import { Orbitals, readOrbitalStates } from '../gl/chapters/orbitals/Orbitals';
import { Galaxy } from '../gl/chapters/galaxy/Galaxy';
import { Flash } from '../gl/Flash';
import { buildBlackbodyLUT } from '../physics/blackbody';
import { Hud } from '../ui/Hud';
import { damp, smoothstep } from '../gl/util';
import type { OrbitalBuffers } from '../gl/chapters/orbitals/sampler.worker';
import type { Junk } from '../gl/chapters/blackhole/junk/Junk';

export interface AppOptions {
  params: URLSearchParams;
  reduced: boolean;
  scroll: () => number;
  onProgress: (p: number) => void;
}

/** Deterministic scenes for screenshots (`?capture=…`) — see scripts/capture.mjs. */
const CAPTURES: Record<string, { blackhole?: number; burst?: number; flash?: number; entry?: number; orbital?: number; zoom?: number; time: number }> = {
  og: { blackhole: 0.02, time: 14 },
  hero: { blackhole: 0, time: 14 },
  fall: { blackhole: 0.7, time: 20 },
  dive: { blackhole: 0.88, time: 20 },
  dive2: { blackhole: 0.93, time: 20 },
  dive3: { blackhole: 0.975, time: 20 },
  point: { blackhole: 0.997, time: 20 },
  flash: { blackhole: 1, burst: 0.07, flash: 1, time: 20 },
  burst15: { blackhole: 1, burst: 0.16, flash: 0.84, time: 20 },
  burst: { blackhole: 1, burst: 0.28, flash: 0.45, time: 20 },
  burst2: { blackhole: 1, burst: 0.55, time: 20 },
  quantum: { blackhole: 1, entry: 1, orbital: 1, time: 30 },
  quantum2: { blackhole: 1, entry: 1, orbital: 2, time: 30 },
  photon1: { blackhole: 1, entry: 1, orbital: 1.7, time: 30 },
  photon2: { blackhole: 1, entry: 1, orbital: 2.7, time: 30 },
  vacuum: { blackhole: 1, entry: 0.05, orbital: 0.05, time: 30 },
  quantum3: { blackhole: 1, entry: 1, orbital: 3, time: 30 },
  galaxy: { blackhole: 1, entry: 1, orbital: 3, zoom: 1, time: 40 },
};

export class App {
  renderer!: WebGLRenderer;
  tier!: Tier;
  blackhole!: BlackHole;
  orbitals: Orbitals | null = null;
  galaxy: Galaxy | null = null;
  /** things thrown into the black hole (loaded after the page is up) */
  junk: Junk | null = null;
  private pulse = 0;
  private bloomBase = 1;
  private bloomBoosted = false;
  private readonly flash = new Flash();
  private lastScale = NaN;
  private blur = 0;
  readonly director = new Director();
  readonly hud = new Hud();
  private composer!: Composer;
  private dynres!: DynamicResolution;
  private lut!: DataTexture;
  private startScale: number | undefined;
  private chapters: Chapter[] = [];
  private active: Chapter[] = [];
  private readonly pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  private lost = false;
  private time = 0;
  private readonly capture: (typeof CAPTURES)[string] | null;
  private readonly frameInfo: FrameInfo = { time: 0, dt: 0, pointer: { x: 0, y: 0 }, width: 1, height: 1, bufferWidth: 1, bufferHeight: 1, dpr: 1 };
  private resizeObserver: ResizeObserver | null = null;
  private measureObserver: ResizeObserver | null = null;
  debug: { begin(): void; end(): void; update(): void } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: AppOptions,
  ) {
    const c = opts.params.get('capture');
    this.capture = c && CAPTURES[c] ? CAPTURES[c]! : null;
    this.director.reduced = opts.reduced;
  }

  async init() {
    const { params, onProgress } = this.opts;
    onProgress(0.04);

    const renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.capture !== null,
    });
    renderer.autoClear = false;
    renderer.toneMapping = NoToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;
    this.bindContextLoss();

    // ── quality ──
    const forced = params.get('quality');
    // High quality by default; only software renderers start lower. Resolution adapts at runtime.
    let tierName: TierName = this.capture ? 'ultra' : isTierName(forced) ? forced : guessTier(renderer) === 'low' && /SwiftShader|llvmpipe|Software/i.test(String(renderer.getContext().getParameter(0x1f01))) ? 'low' : 'high';
    this.tier = { ...TIERS[tierName] };
    this.sizeToCanvas();

    // ── shared resources ──
    this.lut = makeLUT();
    onProgress(0.1);

    // orbital sampling runs in a worker while the GPU bakes and compiles
    const statesDom = readOrbitalStates();
    const sampling = this.sampleOrbitals(statesDom, this.tier.orbitalParticles, (p) => onProgress(0.15 + p * 0.45));

    // ── black hole: bake, compile, benchmark ──
    this.blackhole = new BlackHole(renderer, this.tier, this.lut);
    this.blackhole.bake();
    onProgress(0.2);
    const { scene, camera } = this.blackhole.traceScene;
    await renderer.compileAsync(scene, camera);
    onProgress(0.3);

    if (!this.capture && !isTierName(forced)) {
      tierName = await this.benchmark(tierName);
      this.tier = { ...TIERS[tierName], orbitalParticles: this.tier.orbitalParticles };
    }
    this.dynres = new DynamicResolution(this.tier.bhScale);
    this.dynres.scale = this.startScale ?? this.tier.bhScale;
    this.sizeToCanvas();

    // ── remaining chapters ──
    const buffers = await sampling;
    const count = Math.min(buffers.count, TIERS[tierName].orbitalParticles);
    this.orbitals = new Orbitals(statesDom, buffers, count);
    onProgress(0.66);
    this.galaxy = new Galaxy(this.tier.galaxyStars);
    onProgress(0.72);

    this.chapters = [this.blackhole, this.orbitals, this.galaxy, this.flash];
    this.composer = new Composer(renderer, this.tier, () => this.active);

    // compile every program up-front (including ones that only appear mid-journey) to avoid hitches
    this.orbitals.showAllForCompile();
    await Promise.all([renderer.compileAsync(this.orbitals.scene, this.orbitals.camera), renderer.compileAsync(this.galaxy.scene, this.galaxy.camera)]);
    onProgress(0.86);

    this.resize();
    this.observe();
    this.director.measure();

    // warm-up frames (uploads buffers, allocates targets, links the lazily-built post passes)
    // while the loader is still visible
    for (let i = 0; i < 2; i++) {
      this.renderAll(1 / 60, true);
      this.composer.setZoomBlur(0.01);
      this.composer.render(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
    }
    this.composer.setZoomBlur(0);
    onProgress(1);

    if (this.capture) this.blackhole.startIntro(true);
    if (params.has('debug')) void this.attachDebug();
    if (this.capture) (window as unknown as { __captureReady?: boolean }).__captureReady = false;
  }

  /**
   * Loads the "throw something in" toy: its code, decal atlas and shader programs. Called once the
   * page is interactive, so it never delays the loader. Null for captures.
   */
  async loadJunk(): Promise<Junk | null> {
    if (this.capture || this.junk) return this.junk;
    const [{ Junk }, { makeDecalAtlas }] = await Promise.all([import('../gl/chapters/blackhole/junk/Junk'), import('../gl/chapters/blackhole/junk/decals')]);
    const atlas = await makeDecalAtlas();
    const junk = new Junk(this.blackhole, this.lut, atlas, this.tier, { reduced: this.opts.reduced });
    await junk.compile(this.renderer);
    this.chapters.splice(this.chapters.indexOf(this.blackhole) + 1, 0, junk);
    this.junk = junk;
    this.bloomBase = this.composer.bloom.intensity;
    this.resize();
    return junk;
  }

  private sampleOrbitals(states: ReturnType<typeof readOrbitalStates>, count: number, onProgress: (p: number) => void): Promise<OrbitalBuffers> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../gl/chapters/orbitals/sampler.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: 'progress'; value: number } | { type: 'done'; buffers: OrbitalBuffers };
        if (msg.type === 'progress') onProgress(msg.value);
        else {
          worker.terminate();
          resolve(msg.buffers);
        }
      };
      worker.onerror = (err) => {
        worker.terminate();
        reject(err);
      };
      worker.postMessage({ states: states.map((s) => s.state), count, seed: 1337 });
    });
  }

  /** Estimate full-resolution tracer cost and step the tier down until it fits a frame budget. */
  private async benchmark(start: TierName): Promise<TierName> {
    const W = 480;
    const H = 270;
    const target = new WebGLRenderTarget(W, H, { type: HalfFloatType, depthBuffer: false });
    this.blackhole.resize(W, H, this.width, this.height);
    let ms = await timeGpu(this.renderer, () => this.blackhole.benchmarkFrame(target), 4);
    target.dispose();
    const fullPixels = this.width * this.height * this.dpr * this.dpr;
    const budget = 11; // ms for the tracer, leaving room for post-processing
    let name = start;
    const cost = (t: Tier, scale = t.bhScale) => ms * ((fullPixels * scale * scale) / (W * H)) * (t.bhSteps / TIERS[start].bhSteps);
    if (start === 'high' && cost(TIERS.ultra) < budget * 0.8) name = 'ultra';
    // keep the tier's features; only step down when even the minimum resolution cannot keep up
    while (name !== 'low' && cost(TIERS[name], 0.34) > budget * 1.5) name = lowerTier(name);
    // start the dynamic-resolution controller near the scale the benchmark predicts will fit
    this.startScale = Math.min(TIERS[name].bhScale, Math.max(0.34, Math.sqrt(budget / Math.max(cost(TIERS[name], 1), 1e-3))));
    if (name !== start) {
      const t = TIERS[name];
      this.blackhole.scale = t.bhScale;
      this.blackhole.setQuality(t);
      const { scene, camera } = this.blackhole.traceScene;
      await this.renderer.compileAsync(scene, camera);
    }
    if (this.opts.params.has('debug')) console.info(`[quality] benchmark ${ms.toFixed(2)} ms @${W}×${H} → ${name}`);
    ms = 0;
    return name;
  }

  private bindContextLoss() {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.blackhole.bake();
      this.lost = false;
    });
  }

  private sizeToCanvas() {
    this.width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    this.height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.tier.dprCap);
  }

  resize() {
    this.sizeToCanvas();
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    const bw = Math.round(this.width * this.dpr);
    const bh = Math.round(this.height * this.dpr);
    for (const c of this.chapters) c.resize(bw, bh, this.width, this.height);
    this.frameInfo.width = this.width;
    this.frameInfo.height = this.height;
    this.frameInfo.bufferWidth = bw;
    this.frameInfo.bufferHeight = bh;
    this.frameInfo.dpr = this.dpr;
  }

  private observe() {
    let w = this.canvas.clientWidth;
    let h = this.canvas.clientHeight;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.canvas.clientWidth !== w || this.canvas.clientHeight !== h) {
        w = this.canvas.clientWidth;
        h = this.canvas.clientHeight;
        this.resize();
      }
    });
    this.resizeObserver.observe(this.canvas);
    this.measureObserver = new ResizeObserver(() => this.director.measure());
    this.measureObserver.observe(document.body);
    window.addEventListener('resize', () => this.director.measure());
    void document.fonts?.ready.then(() => this.director.measure());

    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'touch') return;
        this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
      },
      { passive: true },
    );
    document.documentElement.addEventListener('pointerleave', () => {
      this.pointer.tx = 0;
      this.pointer.ty = 0;
    });
  }

  /** Opening camera move; instant for reduced motion and captures. */
  startIntro() {
    this.blackhole.startIntro(this.opts.reduced || this.capture !== null);
  }

  /** Called once per animation frame. */
  frame(dt: number) {
    if (this.lost) return;
    const dtc = Math.min(dt, 1 / 20);
    // only the tracer's cost is managed; freeze the controller while the black hole isn't drawn
    if (this.blackhole.weight > 0.01 && this.dynres.update(dt * 1000) && this.tier.name !== 'low') {
      // persistently overloaded at minimum resolution: lower the tracer's caps
      this.tier = { ...TIERS[lowerTier(this.tier.name)], orbitalParticles: this.tier.orbitalParticles };
      this.dynres.max = this.tier.bhScale;
      this.blackhole.setQuality(this.tier);
    }
    this.blackhole.scale = this.capture ? 1 : this.dynres.scale;
    this.renderAll(dtc, false);
  }

  private renderAll(dt: number, warmup: boolean) {
    this.debug?.begin();
    const j = this.director.update(this.opts.scroll());
    const cap = this.capture;
    if (cap) {
      j.blackhole = cap.blackhole ?? j.blackhole;
      j.burst = cap.burst ?? (cap.entry ? 1 : 0);
      j.flash = cap.flash ?? 0;
      j.entry = cap.entry ?? 0;
      j.orbital = cap.orbital ?? 0;
      j.zoom = cap.zoom ?? 0;
      j.blackholeWeight = 1 - smoothstep(0.02, 0.16, j.burst);
      j.orbitalWeight = j.burst > 0 && j.zoom < 0.2 ? 1 : 0;
      j.galaxyWeight = j.zoom > 0.25 ? 1 : 0;
      this.time = cap.time;
    } else this.time += dt;

    const k = damp(3, dt);
    this.pointer.x += (this.pointer.tx - this.pointer.x) * k;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * k;
    const f = this.frameInfo;
    f.time = this.time;
    f.dt = cap ? 1 / 60 : dt;
    f.pointer.x = this.opts.reduced || cap ? 0 : this.pointer.x;
    f.pointer.y = this.opts.reduced || cap ? 0 : this.pointer.y;

    const bh = this.blackhole;
    bh.progress = j.blackhole;
    bh.weight = bh.observing ? 1 : j.blackholeWeight;
    if (this.orbitals) {
      this.orbitals.setJourney(j.entry, j.orbital, j.zoom, j.burst);
      this.orbitals.weight = j.orbitalWeight;
    }
    if (this.galaxy) {
      this.galaxy.zoom = j.zoom;
      this.galaxy.weight = j.galaxyWeight;
    }
    this.flash.weight = j.flash;
    this.flash.progress = j.burst;
    const junk = this.junk;
    if (junk) {
      junk.weight = junk.alive ? bh.weight : 0;
      bh.flare = junk.flare;
      bh.mdot = junk.mdot;
    }

    this.active = warmup ? this.chapters : this.chapters.filter((c) => c.weight > 0.002);
    // cameras keep easing while a chapter is invisible (cheap, CPU-only), so returning is seamless
    for (const c of this.chapters) c.update(f);
    if (junk) {
      // a jolt when something is torn apart, and as the flare rises
      const k = junk.takeKick();
      if (!this.opts.reduced && !warmup) {
        bh.kick(k);
        this.pulse = Math.max(this.pulse, Math.min(k, 1.5));
      }
      if (junk.flare > 0) {
        this.composer.bloom.intensity = this.bloomBase + 0.45 * junk.flare;
        this.bloomBoosted = true;
      } else if (this.bloomBoosted) {
        this.composer.bloom.intensity = this.bloomBase;
        this.bloomBoosted = false;
      }
    }
    this.composer.render(dt);

    // ── HUD ──
    const orb = this.orbitals;
    const gal = this.galaxy;
    const scale = this.director.scaleLog(bh.fieldOfViewLog10(), orb?.fieldOfViewLog10() ?? -8.7, gal?.fieldOfViewLog10() ?? 21);
    this.hud.setScale(scale);
    this.hud.setChapter(j.chapter);
    if (j.zoom > 0 && gal) this.hud.setCounter('zoom', gal.fieldOfViewLog10());
    else this.hud.setCounter('inter', scale);

    // zoom blur from the rate of change of scale (orders of magnitude per second)
    if (!warmup && !cap && dt > 0) {
      const rate = Number.isFinite(this.lastScale) ? Math.abs(scale - this.lastScale) / dt : 0;
      const target = this.opts.reduced ? 0 : Math.min(0.16, Math.max(0, rate - 0.6) * 0.0065);
      this.blur += (target - this.blur) * damp(target > this.blur ? 14 : 5, dt);
      // a short radial smear centred on the hole when something is torn apart
      this.pulse *= Math.exp(-dt * 4.5);
      const pulse = 0.045 * this.pulse;
      if (pulse > this.blur) this.composer.setZoomBlur(pulse, (bh.lensShift.x + 1) / 2, (bh.lensShift.y + 1) / 2);
      else this.composer.setZoomBlur(this.blur);
    }
    this.lastScale = scale;
    if (orb) this.hud.setOrbital(j.orbital);
    let readouts: Readout[] = bh.readouts();
    if (j.zoom > 0.22 && gal) readouts = gal.readouts();
    else if (j.entry > 0.5 && orb) readouts = orb.readouts();
    this.hud.setReadouts(readouts, performance.now());
    this.debug?.end();

    if (cap && !warmup) (window as unknown as { __captureReady?: boolean }).__captureReady = true;
  }

  private async attachDebug() {
    const [{ default: Stats }, { default: GUI }] = await Promise.all([import('stats-gl'), import('lil-gui')]);
    const stats = new Stats({ trackGPU: true, horizontal: true });
    stats.init(this.renderer);
    document.body.appendChild(stats.dom);
    stats.dom.style.zIndex = '99';
    const gui = new GUI({ title: 'debug' });
    const info = { tier: this.tier.name, scale: () => this.dynres.scale.toFixed(2) };
    gui.add(info, 'tier').disable();
    const bloom = this.composer.bloom;
    gui.add(bloom, 'intensity', 0, 4, 0.01).name('bloom');
    gui.add(bloom.luminanceMaterial, 'threshold', 0, 3, 0.01).name('bloom threshold');
    this.debug = {
      begin: () => stats.begin(),
      end: () => {
        stats.end();
        stats.update();
      },
      update: () => {},
    };
  }
}

function makeLUT(): DataTexture {
  const size = 256;
  const f = buildBlackbodyLUT(size);
  const data = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) data[i] = DataUtils.toHalfFloat(f[i]!);
  const tex = new DataTexture(data, size, 1, RGBAFormat, HalfFloatType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
