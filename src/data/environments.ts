/**
 * environments.ts — theme configs for the five environments (spec §9).
 * Each environment is pure data: palette, fog, prop set id, music mood.
 *
 * COMPLIANCE: palettes follow the "neon-dusk energy/flow" direction — no
 * green-leaf clichés, no cannabis-adjacent color/shape motifs anywhere.
 */

export interface EnvironmentTheme {
  id: string;
  name: string;
  /** Crystal total required to select it from the menu (0 = unlocked). */
  unlockCrystals: number;
  sky: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  groundAlt: number; // alternating slab shade for motion readability
  shoulder: number;
  laneLine: number;
  /** Accent colors for props/obstacles (obstacle TYPE is signaled by shape
   *  + icon, never color alone — spec §16). */
  accents: [number, number, number];
  /** Which prop builder set render/Environments uses. */
  propSet: 'subway' | 'rooftops' | 'forest' | 'stadium' | 'space';
  /** Ambient particle flavor (fireflies, embers, stars, …). */
  ambientParticles: 'sparks' | 'embers' | 'fireflies' | 'dust' | 'stars';
  musicMood: 'tunnel' | 'dusk' | 'trail' | 'golden' | 'orbit';
}

export const ENVIRONMENTS: Record<string, EnvironmentTheme> = {
  subway: {
    id: 'subway',
    name: 'Neon Underground',
    unlockCrystals: 0,
    sky: 0x17123a,
    fogColor: 0x1b1542,
    fogNear: 26,
    fogFar: 78,
    ground: 0x241d4e,
    groundAlt: 0x2a2258,
    shoulder: 0x1c1640,
    laneLine: 0x29e6ff,
    accents: [0xff3fa4, 0xffd166, 0x29e6ff],
    propSet: 'subway',
    ambientParticles: 'sparks',
    musicMood: 'tunnel',
  },
  rooftops: {
    id: 'rooftops',
    name: 'Dusk Rooftops',
    unlockCrystals: 750,
    sky: 0x2a1440,
    fogColor: 0x34194e,
    fogNear: 28,
    fogFar: 84,
    ground: 0x3a2b5e,
    groundAlt: 0x423468,
    shoulder: 0x2e2350,
    laneLine: 0xffd166,
    accents: [0xff8f5c, 0xff3fa4, 0x5ce1ff],
    propSet: 'rooftops',
    ambientParticles: 'embers',
    musicMood: 'dusk',
  },
  forest: {
    id: 'forest',
    name: 'Twilight Trail',
    unlockCrystals: 2000,
    sky: 0x0e2438,
    fogColor: 0x102a40,
    fogNear: 24,
    fogFar: 74,
    ground: 0x2b3a55,
    groundAlt: 0x314260,
    shoulder: 0x223148,
    laneLine: 0x7bffce,
    accents: [0x3fa0ff, 0xffd166, 0x9d7bff],
    propSet: 'forest',
    ambientParticles: 'fireflies',
    musicMood: 'trail',
  },
  stadium: {
    id: 'stadium',
    name: 'Golden Hour Track',
    unlockCrystals: 4000,
    sky: 0x3c2a55,
    fogColor: 0x4a3260,
    fogNear: 30,
    fogFar: 88,
    ground: 0x9c4a3c,
    groundAlt: 0xa85345,
    shoulder: 0x7e3c33,
    laneLine: 0xffe08a,
    accents: [0xffb45c, 0xff5c8a, 0x5cd6ff],
    propSet: 'stadium',
    ambientParticles: 'dust',
    musicMood: 'golden',
  },
  space: {
    id: 'space',
    name: 'Orbital Deck',
    unlockCrystals: 7000,
    sky: 0x070b1e,
    fogColor: 0x0a1026,
    fogNear: 26,
    fogFar: 82,
    ground: 0x141b38,
    groundAlt: 0x182042,
    shoulder: 0x0f1530,
    laneLine: 0x7d5cff,
    accents: [0x5ce1ff, 0xff3fa4, 0xffd166],
    propSet: 'space',
    ambientParticles: 'stars',
    musicMood: 'orbit',
  },
};

/** Rotation order for long-run auto transitions every 1,000m (spec §9). */
export const ENVIRONMENT_ORDER = ['subway', 'rooftops', 'forest', 'stadium', 'space'] as const;

export function themeAfter(id: string): EnvironmentTheme {
  const idx = ENVIRONMENT_ORDER.indexOf(id as (typeof ENVIRONMENT_ORDER)[number]);
  const next = ENVIRONMENT_ORDER[(idx + 1) % ENVIRONMENT_ORDER.length];
  return ENVIRONMENTS[next];
}
