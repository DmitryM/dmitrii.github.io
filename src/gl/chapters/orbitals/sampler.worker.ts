/**
 * Samples |ψ_nlm|² for every role's eigenstate off the main thread.
 * Output buffers are paired by radial quantile and then shuffled with one shared permutation,
 * so particle i keeps its partner across states and any prefix of the buffers is a uniform subset.
 */
import { meanRadius, mulberry32, sampleOrbital, sortByRadius, type OrbitalState } from '../../../physics/hydrogen.ts';

export interface OrbitalBuffers {
  count: number;
  /** [vacuum, state1, state2, …] — xyz in a₀ */
  positions: Float32Array[];
  /** bit k set ⇔ ψ > 0 in state k (bit 0 is random for the vacuum) */
  signs: Float32Array;
  /** per-particle random in [0, 1) */
  seeds: Float32Array;
}

interface Request {
  states: OrbitalState[];
  count: number;
  seed: number;
}

interface WorkerScope {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e: MessageEvent<Request>) => {
  const { states, count, seed } = e.data;
  const rand = mulberry32(seed);
  const total = states.length + 1;

  // vacuum: uniform ball, sorted by radius so condensation is a radial collapse
  const R = Math.max(...states.map((s) => meanRadius(s.n, s.l))) * 8;
  const vac = new Float32Array(count * 3);
  const vacR = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    do {
      x = rand() * 2 - 1;
      y = rand() * 2 - 1;
      z = rand() * 2 - 1;
    } while (x * x + y * y + z * z > 1);
    vac[i * 3] = x * R;
    vac[i * 3 + 1] = y * R;
    vac[i * 3 + 2] = z * R;
    vacR[i] = Math.hypot(x, y, z);
  }
  const vacuum = sortByRadius({ positions: vac, signs: new Int8Array(count).fill(1), radii: vacR });
  ctx.postMessage({ type: 'progress', value: 1 / total });

  const sampled = states.map((s, k) => {
    const out = sortByRadius(sampleOrbital(s, count, seed + 101 * (k + 1)));
    ctx.postMessage({ type: 'progress', value: (k + 2) / total });
    return out;
  });

  // shared Fisher–Yates permutation
  const perm = new Uint32Array(count);
  for (let i = 0; i < count; i++) perm[i] = i;
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = perm[i]!;
    perm[i] = perm[j]!;
    perm[j] = t;
  }

  const all = [vacuum, ...sampled];
  const positions = all.map((s) => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const j = perm[i]!;
      p[i * 3] = s.positions[j * 3]!;
      p[i * 3 + 1] = s.positions[j * 3 + 1]!;
      p[i * 3 + 2] = s.positions[j * 3 + 2]!;
    }
    return p;
  });
  const signs = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const j = perm[i]!;
    let bits = rand() < 0.5 ? 1 : 0;
    for (let k = 0; k < sampled.length; k++) if (sampled[k]!.signs[j]! > 0) bits |= 1 << (k + 1);
    signs[i] = bits;
    seeds[i] = rand();
  }

  const buffers: OrbitalBuffers = { count, positions, signs, seeds };
  ctx.postMessage({ type: 'done', buffers }, [...positions.map((p) => p.buffer), signs.buffer, seeds.buffer]);
};
