/**
 * COMPLIANCE guardrails — spec §2/§20-14/§20-18, enforced mechanically:
 *  - no medical-claim words anywhere in the source
 *  - no direct localStorage / navigator.vibrate / AudioContext use outside
 *    their wrappers
 *  - the config-driven legal seams exist
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Config } from '../src/core/Config';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SRC = join(TESTS_DIR, '..', 'src');

function allSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      allSourceFiles(full, out);
    } else if (/\.(ts|json|css|html)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = allSourceFiles(SRC).concat([join(TESTS_DIR, '..', 'index.html')]);
const rel = (f: string): string => relative(join(TESTS_DIR, '..'), f).split(sep).join('/');

describe('compliance (spec §2)', () => {
  it('no medical-claim words appear anywhere in source or copy', () => {
    // Spec-banned: "cures," "relieves," "treats," "heals," "therapeutic," "medicine."
    const banned = /\b(cures?|reliev\w*|treats?|heal(s|ing|ed)?|therapeutic|medicin\w*)\b/i;
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const match = text.match(banned);
      expect(match, `${rel(file)} contains banned word "${match?.[0] ?? ''}"`).toBeNull();
    }
  });

  it('localStorage is only touched inside core/Storage.ts (spec §4)', () => {
    // Match actual API access (localStorage.x / localStorage[...]), not the
    // word appearing in comments that explain this very rule.
    const access = /\blocalStorage\s*[.[]/;
    for (const file of files) {
      if (rel(file) === 'src/core/Storage.ts') continue;
      const text = readFileSync(file, 'utf8');
      expect(access.test(text), `${rel(file)} touches localStorage directly`).toBe(false);
    }
  });

  it('navigator.vibrate is only touched inside haptics/ (spec §13)', () => {
    for (const file of files) {
      if (rel(file).startsWith('src/haptics/')) continue;
      const text = readFileSync(file, 'utf8');
      expect(text.includes('navigator.vibrate'), `${rel(file)} vibrates directly`).toBe(false);
    }
  });

  it('AudioContext is only constructed inside audio/ (spec §12)', () => {
    for (const file of files) {
      if (rel(file).startsWith('src/audio/')) continue;
      const text = readFileSync(file, 'utf8');
      expect(/new\s+AudioContext/.test(text), `${rel(file)} constructs AudioContext`).toBe(false);
    }
  });

  it('legal copy is config-driven with a 21+ label (spec §2)', () => {
    expect(Config.legal.ageLabel).toContain('21+');
    // The defaults must be placeholders that tell the host to inject, never
    // real legal text baked into the bundle.
    expect(Config.legal.disclaimer).toContain('config.legal');
    expect(Config.legal.licenseLine).toContain('config.legal');
  });

  it('reward-relevant values live in Config (spec §3)', () => {
    expect(typeof Config.score.coinValue).toBe('number');
    expect(Array.isArray(Config.progression.streakBonuses)).toBe(true);
    expect(typeof Config.score.pointsDebounceMs).toBe('number');
  });
});
