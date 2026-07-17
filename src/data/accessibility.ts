/**
 * accessibility.ts — colorblind signal-color remaps (spec §16).
 *
 * Obstacle CLASS is always signaled by silhouette + icon shape first; these
 * remaps make the redundant color channel useful again under each vision
 * type. Keys are the base SIGNAL_COLORS hexes (slide/jump/lane).
 */

import type { ColorblindMode } from '../core/Settings';
import { SIGNAL_COLORS } from '../render/TrackObjects';

export const SIGNAL_REMAPS: Record<ColorblindMode, Record<number, number>> = {
  off: {},
  // Red-green weak: push "lane" toward magenta/blue, keep slide bright yellow.
  deuteranopia: {
    [SIGNAL_COLORS.slide]: 0xffe680,
    [SIGNAL_COLORS.jump]: 0x4dc3ff,
    [SIGNAL_COLORS.lane]: 0xff5cd6,
  },
  protanopia: {
    [SIGNAL_COLORS.slide]: 0xffd93d,
    [SIGNAL_COLORS.jump]: 0x66b8ff,
    [SIGNAL_COLORS.lane]: 0xff66e0,
  },
  // Blue-yellow weak: separate along red↔green instead.
  tritanopia: {
    [SIGNAL_COLORS.slide]: 0xff9d5c,
    [SIGNAL_COLORS.jump]: 0x5cff8a,
    [SIGNAL_COLORS.lane]: 0xff5c7a,
  },
};
