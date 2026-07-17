/**
 * characters.ts — the three unlockable characters (spec §10).
 *
 * COMPLIANCE: quirky, expressive, ADULT-AUDIENCE stylized creatures — no
 * childish cartoons/mascots, no cartoon animals, no candy/toy motifs.
 * Cosmetic only; unlocked by crystal totals (no pay).
 */

export interface CharacterDef {
  id: string;
  name: string;
  blurb: string;
  unlockCrystals: number;
  palette: {
    primary: number;
    secondary: number;
    accent: number;
    glow: number;
  };
}

export const CHARACTERS: Record<string, CharacterDef> = {
  sprocket: {
    id: 'sprocket',
    name: 'Sprocket',
    blurb: 'A lanky robot with piston legs and zero chill.',
    unlockCrystals: 0,
    palette: {
      primary: 0x7c8ce0, // steel violet-blue chassis
      secondary: 0x2d3561, // dark joints/undersuit
      accent: 0xff3fa4, // magenta detail lines
      glow: 0x29e6ff, // cyan visor
    },
  },
  nimbus: {
    id: 'nimbus',
    name: 'Nimbus',
    blurb: 'A floaty cloud-spirit that never quite touches the ground.',
    unlockCrystals: 1500,
    palette: {
      primary: 0xcfd8ff, // pale storm-cloud body
      secondary: 0x8f9fe8, // shaded underside
      accent: 0x7d5cff, // violet wisps
      glow: 0xffd166, // warm inner glow eyes
    },
  },
  ziggy: {
    id: 'ziggy',
    name: 'Ziggy',
    blurb: 'A cool multi-limbed alien with a syncopated four-leg scuttle.',
    unlockCrystals: 3500,
    palette: {
      primary: 0x50d6b8, // sea-teal skin
      secondary: 0x2a6e75, // deep teal shade
      accent: 0xff8f5c, // coral markings
      glow: 0xaef7ff, // ice-blue eyes
    },
  },
};

export const CHARACTER_ORDER = ['sprocket', 'nimbus', 'ziggy'] as const;
