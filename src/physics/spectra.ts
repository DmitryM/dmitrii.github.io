/** Hydrogen spectroscopy: Bohr levels and Rydberg-formula transition wavelengths. */

/** Rydberg constant for hydrogen (reduced-mass corrected) [1/m]. */
export const RYDBERG_H = 1.09677583e7;
/** Ionisation energy of hydrogen [eV] (reduced-mass corrected). */
export const HYDROGEN_IONISATION_EV = 13.598434;

/** Bohr energy level E_n [eV]. */
export function levelEnergy(n: number): number {
  return -HYDROGEN_IONISATION_EV / (n * n);
}

/** Vacuum wavelength [nm] of the photon emitted in the transition upper → lower. */
export function transitionWavelength(upper: number, lower: number): number {
  if (upper <= lower) throw new Error('upper level must be above lower level');
  const inv = RYDBERG_H * (1 / (lower * lower) - 1 / (upper * upper));
  return 1e9 / inv;
}

const SERIES = ['Lyman', 'Balmer', 'Paschen', 'Brackett', 'Pfund', 'Humphreys'];
const GREEK = ['α', 'β', 'γ', 'δ', 'ε'];

/** Spectroscopic name, e.g. (3,2) → "Balmer-α" (a.k.a. H-α). */
export function lineName(upper: number, lower: number): string {
  const series = SERIES[lower - 1] ?? `n=${lower}`;
  const greek = GREEK[upper - lower - 1] ?? `${upper}`;
  return `${series}-${greek}`;
}

export type Band = 'ultraviolet' | 'visible' | 'infrared';

export function band(lambdaNm: number): Band {
  if (lambdaNm < 380) return 'ultraviolet';
  if (lambdaNm > 750) return 'infrared';
  return 'visible';
}

/** Electric-dipole selection rule for real/complex orbitals: Δl = ±1, |Δ|m|| ≤ 1. */
export function dipoleAllowed(a: { l: number; m: number }, b: { l: number; m: number }): boolean {
  return Math.abs(a.l - b.l) === 1 && Math.abs(Math.abs(a.m) - Math.abs(b.m)) <= 1;
}

/** Format a wavelength for display: "656.5 nm" / "1.876 µm". */
export function formatWavelength(lambdaNm: number): string {
  return lambdaNm >= 1000 ? `${(lambdaNm / 1000).toFixed(3)} µm` : `${lambdaNm.toFixed(1)} nm`;
}
