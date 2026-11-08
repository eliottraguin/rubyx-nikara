import { describe, expect, it } from 'vitest';
import { FAR_POSE, NEIGHBORHOOD_POSE, clamp01, easeInOutCubic, poseAt } from './camera-path';

describe('camera-path', () => {
  it('démarre sur la vue lointaine et finit sur la vue quartier', () => {
    expect(poseAt(0)).toEqual(FAR_POSE);
    expect(poseAt(1)).toEqual(NEIGHBORHOOD_POSE);
  });

  it('borne la progression', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(7)).toBe(1);
    expect(poseAt(5)).toEqual(NEIGHBORHOOD_POSE);
  });

  it("l'easing est monotone et vaut 0.5 à mi-parcours", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easeInOutCubic(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('descend progressivement la caméra', () => {
    expect(poseAt(0.5).position.y).toBeLessThan(FAR_POSE.position.y);
    expect(poseAt(0.5).position.y).toBeGreaterThan(NEIGHBORHOOD_POSE.position.y);
  });
});
