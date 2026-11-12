import type { WebGLRenderer } from 'three';

export type TierName = 'low' | 'medium' | 'high' | 'ultra';

export interface Tier {
  name: TierName;
  /** max RK4 steps per pixel in the black-hole tracer */
  bhSteps: number;
  /** upper bound of the black-hole render scale (fraction of drawing-buffer resolution) */
  bhScale: number;
  /** volumetric disk samples per crossing (1 = thin disk) */
  diskSamples: number;
  orbitalParticles: number;
  galaxyStars: number;
  /** debris particles for things thrown into the black hole */
  junkParticles: number;
  bloomLevels: number;
  dprCap: number;
}

export const TIERS: Record<TierName, Tier> = {
  low: { name: 'low', bhSteps: 120, bhScale: 0.5, diskSamples: 1, orbitalParticles: 110_000, galaxyStars: 70_000, junkParticles: 8_000, bloomLevels: 5, dprCap: 1 },
  medium: { name: 'medium', bhSteps: 160, bhScale: 0.66, diskSamples: 2, orbitalParticles: 200_000, galaxyStars: 120_000, junkParticles: 14_000, bloomLevels: 6, dprCap: 1.5 },
  high: { name: 'high', bhSteps: 220, bhScale: 0.85, diskSamples: 4, orbitalParticles: 340_000, galaxyStars: 190_000, junkParticles: 20_000, bloomLevels: 7, dprCap: 2 },
  ultra: { name: 'ultra', bhSteps: 300, bhScale: 1, diskSamples: 6, orbitalParticles: 520_000, galaxyStars: 260_000, junkParticles: 28_000, bloomLevels: 8, dprCap: 2 },
};

const ORDER: TierName[] = ['low', 'medium', 'high', 'ultra'];

export function lowerTier(t: TierName): TierName {
  return ORDER[Math.max(0, ORDER.indexOf(t) - 1)]!;
}

export function isTierName(s: string | null): s is TierName {
  return s !== null && (ORDER as string[]).includes(s);
}

/** First guess from device hints; refined by a GPU benchmark once the tracer is compiled. */
export function guessTier(renderer: WebGLRenderer): TierName {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 8;
  const gl = renderer.getContext();
  let gpu = '';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
  const weakGpu = /SwiftShader|llvmpipe|Software|Mali-4|Adreno \(TM\) [345]\d\d|PowerVR/i.test(gpu);
  const strongGpu = /RTX|Radeon RX|Apple M[2-9]|Apple M\d (Pro|Max|Ultra)|GeForce GTX 1[0-9]{3}|RX [5-9]\d{3}/i.test(gpu);
  if (weakGpu) return 'low';
  if (mobile) return mem >= 6 && cores >= 8 ? 'medium' : 'low';
  if (strongGpu) return 'ultra';
  if (cores >= 8 && mem >= 8) return 'high';
  return 'medium';
}

/**
 * Times a GPU workload. Uses EXT_disjoint_timer_query_webgl2 when available, otherwise falls back
 * to a CPU-side measurement around a synchronising readPixels.
 */
export async function timeGpu(renderer: WebGLRenderer, work: () => void, iterations = 4): Promise<number> {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  const px = new Uint8Array(4);
  // readPixels from the default framebuffer forces every queued command to finish
  const sync = () => {
    renderer.setRenderTarget(null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  // warm-up (driver-side compilation/linking)
  work();
  sync();

  if (ext) {
    const queries: WebGLQuery[] = [];
    for (let i = 0; i < iterations; i++) {
      const q = gl.createQuery()!;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      work();
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      queries.push(q);
    }
    const deadline = performance.now() + 1500;
    const results: number[] = [];
    while (performance.now() < deadline && results.length < queries.length) {
      await new Promise((r) => requestAnimationFrame(r));
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) break;
      for (const q of queries) {
        if ((q as { done?: boolean }).done) continue;
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
          results.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          (q as { done?: boolean }).done = true;
        }
      }
    }
    queries.forEach((q) => gl.deleteQuery(q));
    if (results.length) return results.sort((a, b) => a - b)[Math.floor(results.length / 2)]!;
  }

  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) work();
  sync();
  return (performance.now() - t0) / iterations;
}

/**
 * Keeps the frame time near the display's refresh interval by scaling the black-hole tracer's
 * resolution (the dominant cost) with hysteresis. Reports sustained overload so the app can
 * drop a tier.
 */
export class DynamicResolution {
  scale: number;
  private ema = 16.7;
  private refresh = 16.7;
  private samples: number[] = [];
  private overload = 0;

  constructor(
    public max: number,
    public min = 0.34,
  ) {
    this.scale = max;
  }

  /**
   * Continuous control: the tracer renders into a sub-viewport of a fixed allocation, so the scale
   * can move a little every frame without reallocations or visible resolution pops.
   * @returns true when the device is persistently too slow even at minimum scale
   */
  update(dtMs: number): boolean {
    if (dtMs <= 0 || dtMs > 250) return false; // tab switches, breakpoints
    if (this.samples.length < 90) {
      this.samples.push(dtMs);
      if (this.samples.length === 90) {
        const sorted = [...this.samples].sort((a, b) => a - b);
        this.refresh = Math.max(6.5, sorted[Math.floor(sorted.length * 0.1)]!);
      }
    }
    this.ema += (dtMs - this.ema) * 0.06;
    const budget = this.refresh;
    if (this.ema > budget * 1.15) {
      // over budget: ease down, faster the further over we are
      const over = Math.min(this.ema / budget - 1, 1);
      this.scale = Math.max(this.min, this.scale * (1 - 0.012 - 0.03 * over));
      if (this.scale <= this.min + 1e-3) {
        if (++this.overload > 180) {
          this.overload = 0;
          return true;
        }
      } else this.overload = 0;
    } else if (this.ema < budget * 1.04) {
      // comfortably within budget: creep back up
      this.scale = Math.min(this.max, this.scale * 1.0025);
      this.overload = 0;
    }
    return false;
  }

  get frameMs() {
    return this.ema;
  }
}
