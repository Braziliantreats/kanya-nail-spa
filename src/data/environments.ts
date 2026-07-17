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
  /** Gradient sky dome: zenith and horizon colors. */
  skyTop: number;
  skyBottom: number;
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
    sky: 0x1b1548,
    skyTop: 0x171240,
    skyBottom: 0x5a37a8, // violet tunnel-light horizon glow
    fogColor: 0x2c2268,
    fogNear: 26,
    fogFar: 78,
    ground: 0x342a6b,
    groundAlt: 0x3c317c,
    shoulder: 0x282155,
    laneLine: 0x35f0ff,
    accents: [0xff3fa4, 0xffd166, 0x35f0ff],
    propSet: 'subway',
    ambientParticles: 'sparks',
    musicMood: 'tunnel',
  },
  rooftops: {
    id: 'rooftops',
    name: 'Dusk Rooftops',
    unlockCrystals: 750,
    sky: 0x37205c,
    skyTop: 0x2c1a52,
    skyBottom: 0xc44f86, // hot-pink dusk horizon
    fogColor: 0x4c2c6e,
    fogNear: 28,
    fogFar: 84,
    ground: 0x4c3b78,
    groundAlt: 0x564488,
    shoulder: 0x3c2f68,
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
    sky: 0x123049,
    skyTop: 0x0f2a42,
    skyBottom: 0x2e8a96, // bioluminescent teal glow
    fogColor: 0x1c4258,
    fogNear: 24,
    fogFar: 74,
    ground: 0x375069,
    groundAlt: 0x3e5a76,
    shoulder: 0x2c4259,
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
    sky: 0x4a3168,
    skyTop: 0x3e2a5e,
    skyBottom: 0xff9d5c, // golden-hour horizon
    fogColor: 0x6b4470,
    fogNear: 30,
    fogFar: 88,
    ground: 0xb25848,
    groundAlt: 0xbd6252,
    shoulder: 0x93483b,
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
    sky: 0x080c22,
    skyTop: 0x05070f,
    skyBottom: 0x24358a, // nebula-blue rim
    fogColor: 0x121a42,
    fogNear: 26,
    fogFar: 82,
    ground: 0x1e2856,
    groundAlt: 0x243064,
    shoulder: 0x161d44,
    laneLine: 0x8f6fff,
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
