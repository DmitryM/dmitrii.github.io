import { describe, expect, it } from 'vitest';
import {
  B_CRIT,
  ISCO,
  PHOTON_SPHERE,
  dopplerFactor,
  gravitationalFactor,
  orbitalBeta,
  schwarzschildRadiusMeters,
  traceRay,
} from '../src/physics/schwarzschild.ts';
import { blackbodyChroma, wavelengthColor } from '../src/physics/blackbody.ts';
import { meanRadius, realHarmonic, sampleOrbital, sortByRadius } from '../src/physics/hydrogen.ts';
import { dipoleAllowed, levelEnergy, lineName, transitionWavelength } from '../src/physics/spectra.ts';
import { site } from '../src/content/site.ts';

describe('Schwarzschild geometry', () => {
  it('has the textbook characteristic radii', () => {
    expect(PHOTON_SPHERE).toBe(1.5);
    expect(ISCO).toBe(3);
    expect(B_CRIT).toBeCloseTo(2.598076, 5);
  });

  it('circular orbit at the ISCO moves at c/2', () => {
    expect(orbitalBeta(ISCO)).toBeCloseTo(0.5, 10);
  });

  it('redshift factors behave', () => {
    expect(gravitationalFactor(1)).toBe(0);
    expect(gravitationalFactor(4)).toBeCloseTo(Math.sqrt(0.75), 10);
    expect(dopplerFactor(0, 0.3)).toBeCloseTo(1, 10);
    // head-on approach at β = 0.5: δ = sqrt((1+β)/(1−β)) = √3
    expect(dopplerFactor(0.5, 1)).toBeCloseTo(Math.sqrt(3), 10);
  });

  const shoot = (b: number) => traceRay([-200, b, 0], [1, 0, 0], 20000, 400);

  it('captures rays just inside the critical impact parameter and lets them escape just outside', () => {
    expect(shoot(B_CRIT - 0.01).captured).toBe(true);
    expect(shoot(B_CRIT + 0.01).captured).toBe(false);
  });

  it('reproduces weak-field deflection 2 r_s / b', () => {
    for (const b of [60, 100]) {
      const res = shoot(b);
      expect(res.captured).toBe(false);
      const [dx, dy] = res.finalDir;
      const deflection = Math.atan2(-dy, dx);
      // first post-Newtonian correction: α ≈ 2/b + (15π/64)/b²  (r_s = 1)
      const expected = 2 / b + (15 * Math.PI) / 64 / (b * b);
      expect(Math.abs(deflection - expected) / expected).toBeLessThan(0.02);
    }
  });

  it('computes M87*-class Schwarzschild radius', () => {
    expect(schwarzschildRadiusMeters(6.5e9)).toBeGreaterThan(1.9e13);
    expect(schwarzschildRadiusMeters(6.5e9)).toBeLessThan(1.93e13);
  });
});

describe('blackbody colour', () => {
  const spread = (c: number[]) => Math.max(...c) / Math.min(...c);
  it('6500 K is close to white (D65)', () => {
    expect(spread(blackbodyChroma(6500))).toBeLessThan(1.15);
  });
  it('3000 K is warm', () => {
    const [r, g, b] = blackbodyChroma(3000);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
  it('15000 K is blue', () => {
    const [r, g, b] = blackbodyChroma(15000);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });
  it('H-alpha is red', () => {
    const { rgb } = wavelengthColor(656.5);
    expect(rgb[0]).toBe(1);
    expect(rgb[1]).toBeLessThan(0.2);
  });
});

describe('hydrogen spectroscopy', () => {
  it('Balmer-α (H-α) and Paschen-α wavelengths', () => {
    expect(transitionWavelength(3, 2)).toBeCloseTo(656.47, 1);
    expect(transitionWavelength(4, 3)).toBeCloseTo(1875.6, 0);
    expect(lineName(3, 2)).toBe('Balmer-α');
    expect(lineName(4, 3)).toBe('Paschen-α');
  });
  it('Bohr levels', () => {
    expect(levelEnergy(2)).toBeCloseTo(-3.4, 2);
    expect(levelEnergy(3)).toBeCloseTo(-1.511, 2);
    expect(levelEnergy(4)).toBeCloseTo(-0.85, 2);
  });
  it('role ladder only contains dipole-allowed steps', () => {
    const states = site.experience.roles.map((r) => r.state);
    for (let i = 0; i + 1 < states.length; i++) {
      expect(dipoleAllowed(states[i]!, states[i + 1]!)).toBe(true);
      expect(states[i]!.n).toBeGreaterThan(states[i + 1]!.n);
    }
  });
});

describe('hydrogen orbital sampler', () => {
  for (const state of site.experience.roles.map((r) => r.state)) {
    it(`⟨r⟩ of ${state.label} matches (3n² − l(l+1))/2`, () => {
      const s = sampleOrbital(state, 120_000, 7);
      let sum = 0;
      for (const r of s.radii) sum += r;
      const mean = sum / s.radii.length;
      expect(Math.abs(mean - meanRadius(state.n, state.l)) / meanRadius(state.n, state.l)).toBeLessThan(0.01);
    });
  }

  it('respects angular nodes (d_xy has nodal planes x = 0 and y = 0)', () => {
    const s = sampleOrbital({ n: 3, l: 2, m: -2 }, 60_000, 3);
    let nearNode = 0;
    let nearLobe = 0;
    for (let i = 0; i < s.radii.length; i++) {
      const x = s.positions[i * 3]!;
      const y = -s.positions[i * 3 + 2]!; // three.js z = −physics y
      const r = Math.hypot(x, y) || 1;
      const phi = Math.atan2(y, x);
      if (Math.abs(Math.sin(2 * phi)) < 0.1 && r > 2) nearNode++;
      if (Math.abs(Math.sin(2 * phi)) > 0.95 && r > 2) nearLobe++;
    }
    expect(nearNode).toBeLessThan(nearLobe * 0.05);
  });

  it('signs follow the wavefunction', () => {
    const s = sampleOrbital({ n: 2, l: 1, m: 1 }, 5000, 11);
    for (let i = 0; i < 5000; i++) {
      const x = s.positions[i * 3]!;
      expect(Math.sign(x) || 1).toBe(s.signs[i]);
    }
    expect(realHarmonic(1, 1, 0, 0)).toBeGreaterThan(0);
  });

  it('sortByRadius orders samples', () => {
    const s = sortByRadius(sampleOrbital({ n: 2, l: 1, m: 1 }, 2000, 5));
    for (let i = 1; i < 2000; i++) expect(s.radii[i]!).toBeGreaterThanOrEqual(s.radii[i - 1]!);
  });
});
