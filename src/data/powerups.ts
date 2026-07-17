/**
 * powerups.ts — power-up identity data (spec §7). Pure data: types, signal
 * colors, HUD glyphs, spawn rarity weights, and the movement/modifier split
 * that drives stacking rules.
 */

export type PowerupType = 'magnet' | 'doubleUp' | 'liftoff' | 'glider' | 'zen' | 'dash';

/** Only one MOVEMENT-altering power-up can be active at a time (spec §7). */
export const MOVEMENT_POWERUPS: ReadonlySet<PowerupType> = new Set(['liftoff', 'zen', 'dash']);

export const PICKUP_COLORS: Record<PowerupType, number> = {
  magnet: 0xffd166,
  doubleUp: 0x7bffce,
  liftoff: 0x5ce1ff,
  glider: 0xff8f5c,
  zen: 0xc9a6ff,
  dash: 0xff3fa4,
};

/** HUD chip glyphs — abstract marks, no imagery (COMPLIANCE-neutral). */
export const PICKUP_GLYPHS: Record<PowerupType, string> = {
  magnet: 'M',
  doubleUp: '2×',
  liftoff: '▲',
  glider: 'G',
  zen: 'Z',
  dash: '»',
};

export const PICKUP_NAMES: Record<PowerupType, string> = {
  magnet: 'Magnet',
  doubleUp: 'Double Up',
  liftoff: 'Liftoff',
  glider: 'Glider',
  zen: 'Zen Mode', // COMPLIANCE: neutral name; FX are abstract/fantastical only
  dash: 'Dash',
};

/** Spawn rarity (weights): uncommon vs rare per the spec table. */
export const RARITY_WEIGHTS: ReadonlyArray<[PowerupType, number]> = [
  ['magnet', 22],
  ['doubleUp', 22],
  ['dash', 20],
  ['glider', 16],
  ['liftoff', 10],
  ['zen', 10],
];
