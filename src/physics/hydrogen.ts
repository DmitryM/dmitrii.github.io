/**
 * Hydrogen-atom eigenstates ψ_nlm = R_nl(r) · Y_lm(θ, φ) in atomic units (a₀ = 1),
 * using real spherical harmonics, plus an exact sampler for |ψ|².
 */

export interface OrbitalState {
  n: number;
  l: number;
  /** real-orbital index: m > 0 → cos(mφ), m < 0 → sin(|m|φ), 0 → axial */
  m: number;
}

/** Generalised Laguerre polynomial L_k^α(x) via the three-term recurrence. */
export function laguerre(k: number, alpha: number, x: number): number {
  if (k === 0) return 1;
  let l0 = 1;
  let l1 = 1 + alpha - x;
  for (let i = 1; i < k; i++) {
    const l2 = ((2 * i + 1 + alpha - x) * l1 - (i + alpha) * l0) / (i + 1);
    l0 = l1;
    l1 = l2;
  }
  return l1;
}

/** Associated Legendre P_l^m(x) for m ≥ 0 (without Condon–Shortley phase). */
export function legendre(l: number, m: number, x: number): number {
  let pmm = 1;
  if (m > 0) {
    const s = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
    let f = 1;
    for (let i = 1; i <= m; i++) {
      pmm *= f * s;
      f += 2;
    }
  }
  if (l === m) return pmm;
  let pmm1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmm1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = ((2 * ll - 1) * x * pmm1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmm1;
    pmm1 = pll;
  }
  return pll;
}

/** Radial function R_nl(r), unnormalised (normalisation is irrelevant for sampling and sign). */
export function radial(n: number, l: number, r: number): number {
  const rho = (2 * r) / n;
  return Math.pow(rho, l) * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
}

/** Real spherical harmonic, unnormalised. */
export function realHarmonic(l: number, m: number, cosTheta: number, phi: number): number {
  const am = Math.abs(m);
  const p = legendre(l, am, cosTheta);
  if (m > 0) return p * Math.cos(am * phi);
  if (m < 0) return p * Math.sin(am * phi);
  return p;
}

/** ⟨r⟩ for hydrogen in units of a₀. */
export function meanRadius(n: number, l: number): number {
  return (3 * n * n - l * (l + 1)) / 2;
}

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OrbitalSamples {
  /** xyz triplets in a₀, three.js convention (physics z → y-up) */
  positions: Float32Array;
  /** sign of ψ per sample (+1 / −1) */
  signs: Int8Array;
  /** radius per sample (a₀) */
  radii: Float32Array;
}

const RADIAL_BINS = 4096;

/**
 * Exact sampling of |ψ_nlm|²:
 *  r  — inverse CDF of P(r) = r² R_nl(r)² (numerically tabulated, 4096 bins, linear interpolation)
 *  Ω  — rejection sampling of Y_lm² over uniform (cos θ, φ)
 */
export function sampleOrbital(state: OrbitalState, count: number, seed = 1): OrbitalSamples {
  const { n, l, m } = state;
  const rand = mulberry32(seed);

  // Radial CDF table
  const rMax = 4 * n * n + 12;
  const cdf = new Float64Array(RADIAL_BINS + 1);
  const dr = rMax / RADIAL_BINS;
  let acc = 0;
  let prev = 0;
  for (let i = 1; i <= RADIAL_BINS; i++) {
    const r = i * dr;
    const R = radial(n, l, r);
    const p = r * r * R * R;
    acc += 0.5 * (p + prev) * dr;
    prev = p;
    cdf[i] = acc;
  }
  for (let i = 0; i <= RADIAL_BINS; i++) cdf[i]! /= acc;

  const sampleR = (u: number): number => {
    let lo = 0;
    let hi = RADIAL_BINS;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid]! < u) lo = mid;
      else hi = mid;
    }
    const c0 = cdf[lo]!;
    const c1 = cdf[hi]!;
    const t = c1 > c0 ? (u - c0) / (c1 - c0) : 0;
    return (lo + t) * dr;
  };

  // Angular bound for rejection
  let yMax = 0;
  for (let i = 0; i <= 256; i++) {
    const ct = -1 + (2 * i) / 256;
    for (let j = 0; j < 256; j++) {
      const y = realHarmonic(l, m, ct, (2 * Math.PI * j) / 256);
      yMax = Math.max(yMax, y * y);
    }
  }
  yMax *= 1.02;

  const positions = new Float32Array(count * 3);
  const signs = new Int8Array(count);
  const radii = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = sampleR(rand());
    let ct = 0;
    let phi = 0;
    let y = 0;
    for (;;) {
      ct = 2 * rand() - 1;
      phi = 2 * Math.PI * rand();
      y = realHarmonic(l, m, ct, phi);
      if (rand() * yMax <= y * y) break;
    }
    const st = Math.sqrt(1 - ct * ct);
    const px = r * st * Math.cos(phi);
    const py = r * st * Math.sin(phi);
    const pz = r * ct;
    // physics (x, y, z) → three.js (x, z, −y): z-axis points up on screen
    positions[i * 3 + 0] = px;
    positions[i * 3 + 1] = pz;
    positions[i * 3 + 2] = -py;
    const psi = radial(n, l, r) * y;
    signs[i] = psi >= 0 ? 1 : -1;
    radii[i] = r;
  }
  return { positions, signs, radii };
}

/**
 * Re-orders samples by radius so that particle i in one state pairs with particle i in another
 * at the same radial quantile — transitions then "breathe" instead of scrambling.
 */
export function sortByRadius(s: OrbitalSamples): OrbitalSamples {
  const count = s.radii.length;
  const idx = new Uint32Array(count);
  for (let i = 0; i < count; i++) idx[i] = i;
  idx.sort((a, b) => s.radii[a]! - s.radii[b]!);
  const positions = new Float32Array(count * 3);
  const signs = new Int8Array(count);
  const radii = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const j = idx[i]!;
    positions[i * 3] = s.positions[j * 3]!;
    positions[i * 3 + 1] = s.positions[j * 3 + 1]!;
    positions[i * 3 + 2] = s.positions[j * 3 + 2]!;
    signs[i] = s.signs[j]!;
    radii[i] = s.radii[j]!;
  }
  return { positions, signs, radii };
}

const ORBITAL_SUBSCRIPTS: Record<number, Record<number, string>> = {
  0: { 0: '' },
  1: { [-1]: 'y', 0: 'z', 1: 'x' },
  2: { [-2]: 'xy', [-1]: 'yz', 0: 'z²', 1: 'xz', 2: 'x²−y²' },
  3: { [-3]: 'y(3x²−y²)', [-2]: 'xyz', [-1]: 'yz²', 0: 'z³', 1: 'xz²', 2: 'z(x²−y²)', 3: 'x(x²−3y²)' },
};

/** Cartesian subscript of a real orbital, e.g. (2, −2) → "xy". */
export function orbitalSubscript(l: number, m: number): string {
  return ORBITAL_SUBSCRIPTS[l]?.[m] ?? `m=${m}`;
}

/** Number of lobes of a real orbital: (l − |m| + 1)·(2|m| or 1) — for display. */
export function lobeCount(l: number, m: number): number {
  const am = Math.abs(m);
  return (l - am + 1) * (am === 0 ? 1 : 2 * am);
}
