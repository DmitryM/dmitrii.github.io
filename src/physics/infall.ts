/**
 * Infall of thrown objects and of their tidal debris.
 * Units: r_s = 2GM/c² = 1, so GM = ½ and c = 1 (the same as the ray tracer).
 *
 * Gravity is the Paczyński–Wiita pseudo-Newtonian potential Φ = −GM / (r − r_s). It reproduces
 * the two Schwarzschild radii that shape an infall: the innermost stable circular orbit at 3 r_s
 * and the marginally bound orbit at 2 r_s. Orbits whose angular momentum is just above critical
 * whirl around the hole before they plunge ("zoom-whirl").
 */

export const GM = 0.5;
/** Shadow radius in impact parameter: b_c = 3√3/2 r_s. */
export const B_CRIT = (3 * Math.sqrt(3)) / 2;
/** Where a thrown object of the toy's density is torn apart (the tidal, or Roche, radius). */
export const TIDAL_R = 6.5;
/** Debris that reaches this radius has crossed the horizon as far as anyone outside can tell. */
export const R_CAPTURE = 1.03;
/**
 * Time-lapse: simulation time units (r_s/c) per real second. A real 6.5 × 10⁹ M☉ hole would take
 * days for this; the toy plays it back fast enough for a throw to resolve in a couple of seconds.
 */
export const TIME_LAPSE = 48;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const potential = (r: number) => -GM / (r - 1);

/** Specific angular momentum of a circular orbit: L² = GM r³ / (r − 1)². */
export const circularL = (r: number) => Math.sqrt(GM * r * r * r) / (r - 1);

/** Orbital speed of a circular orbit, v = √(GM r) / (r − 1). */
export const circularSpeed = (r: number) => Math.sqrt(GM * r) / (r - 1);

/** Effective radial potential for angular momentum L. */
export const effectivePotential = (r: number, L: number) => (L * L) / (2 * r * r) + potential(r);

/** Relativistic Doppler factor δ = 1 / (γ (1 − β cos θ)), θ between velocity and line of sight. */
export function dopplerFactor(beta: number, cosTheta: number): number {
  const b = Math.min(Math.abs(beta), 0.995);
  const gamma = 1 / Math.sqrt(1 - b * b);
  return 1 / (gamma * (1 - b * cosTheta));
}

/** Gravitational redshift factor for light climbing out from r: √(1 − r_s/r). */
export const gravitationalShift = (r: number) => Math.sqrt(Math.max(0, 1 - 1 / r));

/**
 * Primary-image impact parameter of a point at radius r, Beloborodov (2002):
 *   1 − cos α = (1 − cos ψ)(1 − r_s/r),   b = r sin α / √(1 − r_s/r)
 * where ψ is the angle between the point's radius vector and the direction to the observer.
 * Accurate to a few per cent for r ≳ 2 r_s; lensing lifts sources behind the hole around its shadow.
 */
export function lensedImpact(r: number, cosPsi: number): number {
  const k = 1 - 1 / r;
  const cosA = 1 - (1 - cosPsi) * k;
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  return (r * sinA) / Math.sqrt(k);
}

/**
 * Tidal elongation of a body: the stretching acceleration grows as r⁻³, so a body barely deforms
 * far out and is drawn into a noodle near the tidal radius.
 */
export function tidalStretch(r: number): number {
  return 1 + Math.min(1.6, 0.34 * Math.pow(TIDAL_R / Math.max(r, 1.2), 3));
}

const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

/**
 * Picks a launch velocity that keeps the spirit of the throw (its direction and roughly its speed)
 * but guarantees that the body is bound and dives inside the tidal radius:
 *  - the orbit plane follows pos × vel, nudged toward the disk's prograde sense (angular momentum
 *    along −y), falling back to `fallbackNormal` for radial throws;
 *  - the energy is capped so the apocentre stays within `raMax`;
 *  - the angular momentum is set for a pericentre of `rp`. Outside the centrifugal barrier
 *    (rp ≳ 2.4 r_s) the body swings around the hole instead of plunging straight in.
 */
export function aimLaunch(pos: Vec3, vel: Vec3, rp: number, raMax: number, fallbackNormal: Vec3): Vec3 {
  const r0 = len(pos);
  const rh = { x: pos.x / r0, y: pos.y / r0, z: pos.z / r0 };
  // orbit normal (perpendicular to r̂)
  let nx = rh.y * vel.z - rh.z * vel.y;
  let ny = rh.z * vel.x - rh.x * vel.z;
  let nz = rh.x * vel.y - rh.y * vel.x;
  const speed = len(vel);
  // prograde sense: −ŷ with its r̂ component removed
  let px = -rh.y * -rh.x;
  let py = -1 + rh.y * rh.y;
  let pz = -rh.y * -rh.z;
  const pl = Math.hypot(px, py, pz);
  if (pl < 0.25) {
    // throwing along the spin axis: orbit in the plane of the sky instead
    const d = fallbackNormal.x * rh.x + fallbackNormal.y * rh.y + fallbackNormal.z * rh.z;
    px = fallbackNormal.x - rh.x * d;
    py = fallbackNormal.y - rh.y * d;
    pz = fallbackNormal.z - rh.z * d;
    const fl = Math.hypot(px, py, pz) || 1;
    // keep it prograde where the sky plane allows
    const s = py > 0 ? -1 : 1;
    px *= s / fl;
    py *= s / fl;
    pz *= s / fl;
  } else {
    px /= pl;
    py /= pl;
    pz /= pl;
  }
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-3 * Math.max(speed, 1e-6) || speed < 1e-5) {
    nx = px;
    ny = py;
    nz = pz;
  } else {
    // bias toward prograde: retrograde throws are bent around, prograde ones barely change
    nx = nx / nl + 0.9 * px;
    ny = ny / nl + 0.9 * py;
    nz = nz / nl + 0.9 * pz;
    const m = Math.hypot(nx, ny, nz) || 1;
    nx /= m;
    ny /= m;
    nz /= m;
  }
  // direction of tangential motion: n × r̂
  const tx = ny * rh.z - nz * rh.y;
  const ty = nz * rh.x - nx * rh.z;
  const tz = nx * rh.y - ny * rh.x;

  const phi0 = potential(r0);
  const peri = Math.min(rp, 0.8 * r0);
  // energy from the throw, capped so the apocentre stays near
  let E = 0.5 * speed * speed + phi0;
  let L2 = 0;
  for (let k = 0; k < 4; k++) {
    L2 = Math.max(0, 2 * peri * peri * (E - potential(peri)));
    E = Math.min(E, effectivePotential(raMax, Math.sqrt(L2)));
  }
  L2 = Math.max(0, 2 * peri * peri * (E - potential(peri)));
  let vr2 = 2 * (E - phi0) - L2 / (r0 * r0);
  if (vr2 < 0) {
    // too slow for such an orbit to pass through here: launch from its apocentre instead,
    // with the angular momentum for which V_eff(r0) = V_eff(rp)
    L2 = (2 * (phi0 - potential(peri))) / (1 / (peri * peri) - 1 / (r0 * r0));
    vr2 = 0;
  }
  const vt = Math.sqrt(L2) / r0;
  const radialIn = vel.x * rh.x + vel.y * rh.y + vel.z * rh.z;
  // an outward fling is kept (the body boomerangs), but gently
  const vr = Math.sqrt(vr2) * (radialIn > 0 ? 0.35 : -1);
  return { x: tx * vt + rh.x * vr, y: ty * vt + rh.y * vr, z: tz * vt + rh.z * vr };
}

/** Upper bound on a substep at radius r: a small fraction of the local dynamical time. */
export const maxStep = (r: number) => 0.06 * Math.sqrt(Math.pow(Math.max(r - 1, 0.02), 3) / GM);

/**
 * Advances a test particle by dt (velocity Verlet, adaptive substeps near the hole). Speeds are
 * capped just below c. Returns the final radius.
 */
export function step(p: Vec3, v: Vec3, dt: number): number {
  let r = len(p);
  const n = Math.min(24, Math.max(1, Math.ceil(dt / maxStep(r))));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    r = Math.max(len(p), 1.0001);
    let a = -GM / ((r - 1) * (r - 1) * r);
    v.x += 0.5 * h * a * p.x;
    v.y += 0.5 * h * a * p.y;
    v.z += 0.5 * h * a * p.z;
    p.x += h * v.x;
    p.y += h * v.y;
    p.z += h * v.z;
    r = Math.max(len(p), 1.0001);
    a = -GM / ((r - 1) * (r - 1) * r);
    v.x += 0.5 * h * a * p.x;
    v.y += 0.5 * h * a * p.y;
    v.z += 0.5 * h * a * p.z;
    const s = len(v);
    if (s > 0.98) {
      v.x *= 0.98 / s;
      v.y *= 0.98 / s;
      v.z *= 0.98 / s;
    }
    if (r < R_CAPTURE) break;
  }
  return len(p);
}

/**
 * Debris after disruption. Shocks in the self-crossing stream dissipate orbital energy: the gas
 * relaxes toward slightly sub-Keplerian prograde rotation in the disk plane, settles vertically and
 * drifts inward, so it circularises and then drains through the ISCO. The coupling weakens with
 * radius, which lets the unbound tail escape. Operates on packed xyz arrays for speed.
 */
export const DEBRIS = {
  /** drag rate toward the target flow, per r_s/c, at full strength */
  coupling: 0.07,
  /** target rotation as a fraction of the circular speed (sub-Keplerian: drifts inward) */
  keplerFraction: 0.82,
  /** target inflow speed: a + b / R */
  inflow: 0.05,
  inflowR: 0.06,
  /** beyond this radius the drag weakens as R⁻², letting the unbound tail escape */
  reach: 22,
};

/**
 * Strength of the circularisation by the age of the debris (real seconds): the fresh stream flies
 * almost freely — the inner, more bound half dives in while the rest is flung out in a long arc —
 * then shocks set in and drain it within a few seconds.
 */
export function debrisStrength(age: number): number {
  return 0.08 + 0.92 * Math.min(1, Math.max(0, (age - 0.45) / 0.95));
}

export function stepDebris(pos: Float32Array, vel: Float32Array, i: number, dt: number, strength = 1): number {
  const o = i * 3;
  let x = pos[o]!;
  let y = pos[o + 1]!;
  let z = pos[o + 2]!;
  let vx = vel[o]!;
  let vy = vel[o + 1]!;
  let vz = vel[o + 2]!;
  // hot loop (thousands of particles per frame): plain sqrt, hoisted constants, coarser substeps
  // than for the bodies — debris only has to look right
  const { coupling: c0, keplerFraction, inflow, inflowR, reach } = DEBRIS;
  const reach2 = reach * reach;
  let r = Math.sqrt(x * x + y * y + z * z);
  const n = Math.min(10, Math.max(1, Math.ceil(dt / (1.6 * maxStep(r)))));
  const h = dt / n;
  for (let k = 0; k < n; k++) {
    r = Math.max(Math.sqrt(x * x + y * y + z * z), 1.0001);
    const a = -GM / ((r - 1) * (r - 1) * r);
    // circularisation drag, in cylindrical coordinates about the spin axis
    const R2 = Math.max(x * x + z * z, 0.09);
    const R = Math.sqrt(R2);
    const coupling = c0 * strength * Math.min(1, reach2 / R2);
    const Rc = Math.max(R, 1.6);
    const vphi = (Math.sqrt(GM * Rc) / (Rc - 1)) * keplerFraction;
    const vin = inflow + inflowR / R;
    const tvx = (-z / R) * vphi - (x / R) * vin;
    const tvz = (x / R) * vphi - (z / R) * vin;
    const tvy = -0.06 * y;
    vx += h * (a * x + coupling * (tvx - vx));
    vy += h * (a * y + coupling * 2 * (tvy - vy));
    vz += h * (a * z + coupling * (tvz - vz));
    const s2 = vx * vx + vy * vy + vz * vz;
    if (s2 > 0.9604) {
      const f = 0.98 / Math.sqrt(s2);
      vx *= f;
      vy *= f;
      vz *= f;
    }
    x += h * vx;
    y += h * vy;
    z += h * vz;
    if (r < R_CAPTURE) break;
  }
  pos[o] = x;
  pos[o + 1] = y;
  pos[o + 2] = z;
  vel[o] = vx;
  vel[o + 1] = vy;
  vel[o + 2] = vz;
  return Math.sqrt(x * x + y * y + z * z);
}
