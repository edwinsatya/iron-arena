import { describe, expect, it } from 'vitest';
import { corsHeaders } from '../src/common';

const SITE = 'https://iron-arena.touchsimpledev.site';
const allowFor = (origin: string | null, allowed: string) =>
  corsHeaders(origin, allowed)['Access-Control-Allow-Origin'];

describe('lobby CORS (ALLOWED_ORIGINS)', () => {
  it('lets every site in with "*"', () => {
    expect(allowFor('https://example.com', '*')).toBe('*');
  });

  it('allows the listed site, written as a full origin or as just its host', () => {
    expect(allowFor(SITE, SITE)).toBe(SITE);
    expect(allowFor(SITE, 'iron-arena.touchsimpledev.site')).toBe(SITE);
    expect(allowFor(SITE, 'https://other.example, iron-arena.touchsimpledev.site/')).toBe(SITE);
  });

  it('never echoes a site that is not listed', () => {
    expect(allowFor('https://evil.example', 'iron-arena.touchsimpledev.site')).toBe(SITE);
    expect(allowFor('https://iron-arena.touchsimpledev.site.evil.example', SITE)).toBe(SITE);
    expect(allowFor(null, 'iron-arena.touchsimpledev.site')).toBe(SITE);
  });
});
