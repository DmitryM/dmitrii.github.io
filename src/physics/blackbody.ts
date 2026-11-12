/**
 * Colour science for emitters: CIE 1931 2° colour-matching functions (multi-lobe Gaussian fit,
 * Wyman, Sloan & Shirley, "Simple Analytic Approximations to the CIE XYZ Color Matching Functions",
 * JCGT 2013), Planck's law, and conversion to linear sRGB (D65).
 */

const H = 6.62607015e-34; // Planck constant [J s]
const C = 2.99792458e8; // speed of light [m/s]
const KB = 1.380649e-23; // Boltzmann constant [J/K]

function lobe(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/** CIE 1931 colour matching functions at wavelength λ [nm]. */
export function cieXYZ(lambdaNm: number): [number, number, number] {
  const l = lambdaNm;
  const x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** XYZ → linear sRGB (D65). */
export function xyzToLinearSRGB(x: number, y: number, z: number): [number, number, number] {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

/** Planck spectral radiance B_λ(T) [W·sr⁻¹·m⁻³]. */
export function planck(lambdaNm: number, T: number): number {
  const l = lambdaNm * 1e-9;
  return (2 * H * C * C) / (l ** 5 * (Math.exp((H * C) / (l * KB * T)) - 1));
}

/** Integrated XYZ of a blackbody at temperature T (unnormalised). */
export function blackbodyXYZ(T: number): [number, number, number] {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let l = 380; l <= 780; l += 2) {
    const b = planck(l, T);
    const [x, y, z] = cieXYZ(l);
    X += b * x;
    Y += b * y;
    Z += b * z;
  }
  return [X, Y, Z];
}

/**
 * Chromaticity of a blackbody in linear sRGB, normalised to unit luminance (Y = 1).
 * Out-of-gamut negatives are clipped.
 */
export function blackbodyChroma(T: number): [number, number, number] {
  const [X, Y, Z] = blackbodyXYZ(T);
  const [r, g, b] = xyzToLinearSRGB(X / Y, 1, Z / Y);
  return [Math.max(r, 0), Math.max(g, 0), Math.max(b, 0)];
}

export const LUT_T_MIN = 1000;
export const LUT_T_MAX = 40000;

/** Map temperature to LUT coordinate (log-spaced). Mirrors blackbody.glsl. */
export function lutCoord(T: number): number {
  return Math.log(T / LUT_T_MIN) / Math.log(LUT_T_MAX / LUT_T_MIN);
}

/**
 * RGBA LUT, log-spaced in T between LUT_T_MIN and LUT_T_MAX.
 * rgb = unit-luminance chroma; a = 1.
 */
export function buildBlackbodyLUT(size = 256): Float32Array {
  const data = new Float32Array(size * 4);
  for (let i = 0; i < size; i++) {
    const T = LUT_T_MIN * Math.pow(LUT_T_MAX / LUT_T_MIN, i / (size - 1));
    const [r, g, b] = blackbodyChroma(T);
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 1;
  }
  return data;
}

/**
 * Colour of monochromatic light at λ [nm] in linear sRGB, normalised so the max channel is 1,
 * plus a visibility factor (photopic luminous efficiency relative to its peak).
 * Outside the visible band the colour falls back to a deep red / violet hint.
 */
export function wavelengthColor(lambdaNm: number): { rgb: [number, number, number]; visibility: number } {
  const clamped = Math.min(Math.max(lambdaNm, 390), 720);
  const [x, y, z] = cieXYZ(clamped);
  const [r, g, b] = xyzToLinearSRGB(x, y, z);
  const rgb: [number, number, number] = [Math.max(r, 0), Math.max(g, 0), Math.max(b, 0)];
  const m = Math.max(rgb[0], rgb[1], rgb[2], 1e-6);
  rgb[0] /= m;
  rgb[1] /= m;
  rgb[2] /= m;
  const visible = lambdaNm >= 380 && lambdaNm <= 780;
  const visibility = visible ? cieXYZ(lambdaNm)[1] / 0.821 : 0;
  return { rgb, visibility };
}
