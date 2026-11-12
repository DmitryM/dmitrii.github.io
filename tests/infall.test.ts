import { describe, expect, it } from 'vitest';
import {
  B_CRIT,
  GM,
  R_CAPTURE,
  TIDAL_R,
  TIME_LAPSE,
  aimLaunch,
  circularL,
  debrisStrength,
  dopplerFactor,
  effectivePotential,
  lensedImpact,
  potential,
  step,
  stepDebris,
  tidalStretch,
} from '../src/physics/infall.ts';
import { mulberry32 } from '../src/physics/hydrogen.ts';

describe('Paczyński–Wiita gravity', () => {
  it('puts the innermost stable circular orbit at 3 r_s', () => {
    // L(r) of circular orbits has its minimum at the ISCO
    const h = 1e-4;
    const dL = (circularL(3 + h) - circularL(3 - h)) / (2 * h);
    expect(Math.abs(dL)).toBeLessThan(1e-6);
    expect(circularL(2.9)).toBeGreaterThan(circularL(3));
    expect(circularL(3.1)).toBeGreaterThan(circularL(3));
  });

  it('puts the marginally bound orbit at 2 r_s with L = 2', () => {
    expect(circularL(2)).toBeCloseTo(2, 10);
    // a circular orbit there has exactly zero energy
    expect(effectivePotential(2, circularL(2))).toBeCloseTo(0, 10);
    expect(potential(3)).toBeCloseTo(-GM / 2, 12);
  });

  it('keeps a circular orbit circular', () => {
    const r = 8;
    const v = Math.sqrt(GM * r) / (r - 1);
    const p = { x: r, y: 0, z: 0 };
    const vel = { x: 0, y: 0, z: v };
    let rmin = Infinity;
    let rmax = 0;
    for (let i = 0; i < 2000; i++) {
      const rr = step(p, vel, 0.5);
      rmin = Math.min(rmin, rr);
      rmax = Math.max(rmax, rr);
    }
    expect(rmax - rmin).toBeLessThan(0.02);
  });
});

describe('lensing (Beloborodov 2002)', () => {
  it('is negligible far away', () => {
    const r = 1e7;
    const psi = 1.1;
    expect(lensedImpact(r, Math.cos(psi)) / (r * Math.sin(psi))).toBeCloseTo(1, 5);
  });

  it('leaves a point straight in front of the hole in place', () => {
    const r = 6;
    const psi = 1e-3;
    expect(lensedImpact(r, Math.cos(psi)) / (r * Math.sin(psi))).toBeCloseTo(1, 4);
  });

  it('lifts a point directly behind the hole outside the shadow', () => {
    // the Einstein ring of a source at 3 r_s straight behind the hole
    expect(lensedImpact(3, -1)).toBeCloseTo(2 * Math.sqrt(3), 6);
    expect(lensedImpact(3, -1)).toBeGreaterThan(B_CRIT);
    expect(lensedImpact(10, -1)).toBeGreaterThan(B_CRIT);
  });
});

describe('Doppler factor', () => {
  it('is reciprocal for approach and recession', () => {
    for (const beta of [0.1, 0.5, 0.9]) expect(dopplerFactor(beta, 1) * dopplerFactor(beta, -1)).toBeCloseTo(1, 10);
  });
  it('shows the transverse Doppler effect', () => {
    expect(dopplerFactor(0.6, 0)).toBeCloseTo(0.8, 10);
  });
});

describe('tidal stretch', () => {
  it('grows toward the hole and stays bounded', () => {
    expect(tidalStretch(40)).toBeLessThan(1.01);
    expect(tidalStretch(TIDAL_R)).toBeGreaterThan(1.3);
    expect(tidalStretch(1.1)).toBeLessThanOrEqual(2.6);
  });
});

describe('every throw is annihilated', () => {
  const rand = mulberry32(7);
  const view = { x: 0.1, y: 0.1, z: 0.99 };
  const vn = Math.hypot(view.x, view.y, view.z);
  const fallback = { x: view.x / vn, y: view.y / vn, z: view.z / vn };

  it('dives inside the tidal radius and its debris is swallowed', () => {
    let worstDive = 0;
    let worstSwallow = 0;
    for (let k = 0; k < 300; k++) {
      // a point in the plane of the sky, 7–24 r_s from the hole, thrown in any direction
      const ang = rand() * Math.PI * 2;
      const rr = 7 + rand() * 17;
      const ux = { x: 1, y: 0, z: -0.1 };
      const uy = { x: 0, y: 1, z: -0.1 };
      const p = { x: (ux.x * Math.cos(ang) + uy.x * Math.sin(ang)) * rr, y: (ux.y * Math.cos(ang) + uy.y * Math.sin(ang)) * rr, z: (ux.z * Math.cos(ang) + uy.z * Math.sin(ang)) * rr };
      const speed = rand() < 0.3 ? 0 : rand() * 0.5;
      const dir = { x: rand() - 0.5, y: rand() - 0.5, z: rand() - 0.5 };
      const dl = Math.hypot(dir.x, dir.y, dir.z);
      const v0 = { x: (dir.x / dl) * speed, y: (dir.y / dl) * speed, z: (dir.z / dl) * speed };
      const rp = 2.6 + rand() * (0.8 * TIDAL_R - 2.6);
      const v = aimLaunch(p, v0, rp, Math.max(rr * 1.25, rr + 3), fallback);
      expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);

      // the body must reach the tidal radius
      let t = 0;
      let r = Math.hypot(p.x, p.y, p.z);
      while (r > TIDAL_R && t < 40 * TIME_LAPSE) {
        r = step(p, v, 0.5);
        t += 0.5;
      }
      expect(r).toBeLessThanOrEqual(TIDAL_R);
      worstDive = Math.max(worstDive, t / TIME_LAPSE);

      // …and swing past its pericentre rather than plunge (it is outside the barrier)
      const probe = { p: { ...p }, v: { ...v } };
      let rmin = r;
      for (let s = 0; s < 120; s++) rmin = Math.min(rmin, step(probe.p, probe.v, 0.5));
      expect(rmin).toBeGreaterThan(0.85 * Math.min(rp, 0.8 * rr));

      // a debris particle released there spirals in under the circularisation drag
      const pos = new Float32Array([p.x, p.y, p.z]);
      const vel = new Float32Array([v.x, v.y, v.z]);
      let s = 0;
      r = Math.hypot(p.x, p.y, p.z);
      while (r > R_CAPTURE && s < 60 * TIME_LAPSE) {
        r = stepDebris(pos, vel, 0, 0.5, debrisStrength(s / TIME_LAPSE));
        s += 0.5;
      }
      expect(r).toBeLessThanOrEqual(R_CAPTURE);
      worstSwallow = Math.max(worstSwallow, s / TIME_LAPSE);
    }
    // seconds of real time at the toy's time-lapse
    expect(worstDive).toBeLessThan(12);
    expect(worstSwallow).toBeLessThan(14);
  });
});
