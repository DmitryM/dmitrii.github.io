import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ATLAS_SIZE, BODY_RADIUS, DECALS, dissolveThreshold, modelGeometry, surfaceSamples } from '../src/gl/chapters/blackhole/junk/models.ts';
import { JUNK_IDS } from '../src/i18n/index.ts';

describe('junk models', () => {
  for (const id of JUNK_IDS) {
    it(`${id} builds a clean, normalised geometry`, () => {
      const g = modelGeometry(id);
      expect(g.index).toBeNull();
      for (const name of ['position', 'normal', 'color', 'aMat', 'aDecal']) expect(g.getAttribute(name), name).toBeDefined();
      const pos = g.getAttribute('position').array;
      for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i]!)).toBe(true);
      const nrm = g.getAttribute('normal').array;
      for (let i = 0; i < nrm.length; i++) expect(Number.isFinite(nrm[i]!)).toBe(true);
      expect(g.boundingSphere!.radius).toBeCloseTo(BODY_RADIUS, 3);
      expect(g.getAttribute('position').count).toBeLessThan(60_000);
    });

    it(`${id} has surface samples for its debris`, () => {
      const s = surfaceSamples(id, 500);
      expect(s.count).toBe(500);
      for (let i = 0; i < s.count * 3; i++) {
        expect(Number.isFinite(s.position[i]!)).toBe(true);
        expect(Math.abs(s.position[i]!)).toBeLessThanOrEqual(BODY_RADIUS * 1.001);
      }
    });
  }

  it('fits every decal inside the atlas', () => {
    for (const [x, y, w, h] of Object.values(DECALS)) {
      expect(x + w).toBeLessThanOrEqual(ATLAS_SIZE);
      expect(y + h).toBeLessThanOrEqual(ATLAS_SIZE);
    }
  });

  it('dissolves the side facing the hole first', () => {
    const dir = new Vector3(1, 0, 0);
    expect(dissolveThreshold(BODY_RADIUS, 0, 0, dir, 0)).toBeLessThan(dissolveThreshold(-BODY_RADIUS, 0, 0, dir, 0));
    // loose parts go early
    expect(dissolveThreshold(0, 0, 0, dir, 1)).toBeLessThan(dissolveThreshold(0, 0, 0, dir, 0));
  });
});
