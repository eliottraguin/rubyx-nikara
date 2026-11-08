import { describe, expect, it } from 'vitest';
import { generateSkyline, parseSeed, DEFAULT_SKYLINE_SEED } from './generate-skyline';

describe('generateSkyline', () => {
  it('est reproductible pour une même seed', () => {
    expect(generateSkyline({ seed: 42 })).toEqual(generateSkyline({ seed: 42 }));
  });
  it('varie selon la seed', () => {
    expect(generateSkyline({ seed: 1 })).not.toEqual(generateSkyline({ seed: 2 }));
  });
  it('produit des dimensions valides', () => {
    const b = generateSkyline();
    expect(b.length).toBeGreaterThan(5);
    for (const x of b) {
      expect(x.width).toBeGreaterThan(0);
      expect(x.height).toBeGreaterThan(1);
    }
  });
  it('parseSeed retombe sur la seed par défaut', () => {
    expect(parseSeed(null)).toBe(DEFAULT_SKYLINE_SEED);
    expect(parseSeed('abc')).toBe(DEFAULT_SKYLINE_SEED);
    expect(parseSeed('7')).toBe(7);
  });
});
