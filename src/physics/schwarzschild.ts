/**
 * Schwarzschild black hole in geometric units with r_s = 2GM/c² = 1.
 *
 * Null geodesics are integrated in a Cartesian "pseudo-Newtonian" form that is exact for the
 * Schwarzschild metric's orbit equation u'' + u = (3/2) r_s u²:
 *
 *     d²x/dλ² = −(3/2) h² x / r⁵,   h = |x × dx/dλ| (conserved)
 *
 * This file mirrors the GLSL integrator in blackhole.frag so it can be unit-tested.
 */

export const PHOTON_SPHERE = 1.5;
export const ISCO = 3;
/** Critical impact parameter b_c = (3√3/2) r_s. */
export const B_CRIT = (3 * Math.sqrt(3)) / 2;

/** Orbital speed (fraction of c) of a circular geodesic, measured by a local static observer. */
export function orbitalBeta(r: number): number {
  return 1 / Math.sqrt(2 * (r - 1));
}

/** Gravitational redshift factor for light escaping from radius r to infinity. */
export function gravitationalFactor(r: number): number {
  return Math.sqrt(Math.max(1 - 1 / r, 0));
}

/**
 * Special-relativistic Doppler factor δ = 1 / (γ (1 − β cos θ)),
 * θ = angle between emitter velocity and photon direction (towards observer).
 */
export function dopplerFactor(beta: number, cosTheta: number): number {
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  return 1 / (gamma * (1 - beta * cosTheta));
}

/** Angular radius of the shadow seen by a static observer at radius r. */
export function shadowAngularRadius(r: number): number {
  const s = (B_CRIT * Math.sqrt(1 - 1 / r)) / r;
  return r < PHOTON_SPHERE ? Math.PI - Math.asin(Math.min(s, 1)) : Math.asin(Math.min(s, 1));
}

/** Rate of a static clock at r relative to one at infinity. */
export function clockRate(r: number): number {
  return gravitationalFactor(r);
}

type V3 = [number, number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface TraceResult {
  captured: boolean;
  finalDir: V3;
  steps: number;
}

/** Step size as a function of radius — mirrors stepSize() in blackhole.frag. */
export function stepSize(r: number): number {
  const near = Math.abs(r - PHOTON_SPHERE);
  const k = Math.min(Math.max(0.5 + near, 0.5), 1);
  return Math.min(Math.max(0.07 * r * k, 0.005), 3);
}

/** RK4 integration of a photon starting at `origin` with unit direction `dir`. */
export function traceRay(origin: V3, dir: V3, maxSteps = 4000, escapeRadius = 400): TraceResult {
  let x: V3 = [...origin];
  let v: V3 = [...dir];
  const hv = cross(x, v);
  const h2 = dot(hv, hv);
  const acc = (p: V3): V3 => {
    const r2 = dot(p, p);
    const k = (-1.5 * h2) / (r2 * r2 * Math.sqrt(r2));
    return [p[0] * k, p[1] * k, p[2] * k];
  };
  const add = (a: V3, b: V3, s: number): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  for (let i = 0; i < maxSteps; i++) {
    const r = Math.sqrt(dot(x, x));
    if (r < 1) return { captured: true, finalDir: v, steps: i };
    if (r > escapeRadius && dot(x, v) > 0) {
      const n = Math.sqrt(dot(v, v));
      return { captured: false, finalDir: [v[0] / n, v[1] / n, v[2] / n], steps: i };
    }
    const dt = stepSize(r);
    const k1x = v;
    const k1v = acc(x);
    const k2x = add(v, k1v, dt / 2);
    const k2v = acc(add(x, k1x, dt / 2));
    const k3x = add(v, k2v, dt / 2);
    const k3v = acc(add(x, k2x, dt / 2));
    const k4x = add(v, k3v, dt);
    const k4v = acc(add(x, k3x, dt));
    x = [
      x[0] + (dt / 6) * (k1x[0] + 2 * k2x[0] + 2 * k3x[0] + k4x[0]),
      x[1] + (dt / 6) * (k1x[1] + 2 * k2x[1] + 2 * k3x[1] + k4x[1]),
      x[2] + (dt / 6) * (k1x[2] + 2 * k2x[2] + 2 * k3x[2] + k4x[2]),
    ];
    v = [
      v[0] + (dt / 6) * (k1v[0] + 2 * k2v[0] + 2 * k3v[0] + k4v[0]),
      v[1] + (dt / 6) * (k1v[1] + 2 * k2v[1] + 2 * k3v[1] + k4v[1]),
      v[2] + (dt / 6) * (k1v[2] + 2 * k2v[2] + 2 * k3v[2] + k4v[2]),
    ];
  }
  const n = Math.sqrt(dot(v, v));
  return { captured: false, finalDir: [v[0] / n, v[1] / n, v[2] / n], steps: maxSteps };
}

/** Schwarzschild radius [m] of a mass given in solar masses. */
export function schwarzschildRadiusMeters(solarMasses: number): number {
  const G = 6.6743e-11;
  const c = 2.99792458e8;
  const Msun = 1.98847e30;
  return (2 * G * solarMasses * Msun) / (c * c);
}
