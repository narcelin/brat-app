/** A whole avatar is derived from one integer.
 *
 *  Storing a seed rather than a set of chosen parts keeps the column count at
 *  one, makes validation trivial, and means "roll again" is just a new number.
 *  The mapping must stay stable: changing the order of any list below silently
 *  redraws everyone's face. Append, never reorder. */

// The darkest tones stop short of the navy outline colour — any closer and the
// face reads as a single dark blob at roster size.
export const SKINS = [
  '#FBE0C4', '#F9D7B7', '#F6C89A', '#E8A87C',
  '#C98A5E', '#96603C', '#7A4A2A', '#61391F',
] as const

export const HAIR_COLORS = [
  '#1B1108', '#3A2416', '#6B3410', '#D9581F',
  '#E8C24A', '#F2B705', '#9AA0A6', '#7B4FD1',
] as const

export const SHIRTS = [
  '#1C63C8', '#2FA84F', '#E8467C', '#7B4FD1', '#E23B3B',
  '#17A6A6', '#F07A1A', '#FFD200', '#111827', '#00A3FF',
] as const

export const HAIR_STYLES = ['none', 'tuft', 'curls', 'pigtails', 'swoosh', 'long', 'beanie'] as const
export const EYE_STYLES = ['normal', 'wide', 'sleepy', 'side', 'beady'] as const
export const EYEWEAR = ['none', 'none', 'round', 'square', 'shades'] as const
export const MOUTHS = ['grin', 'smile', 'tongue', 'oh', 'smirk'] as const

export type HairStyle = (typeof HAIR_STYLES)[number]
export type EyeStyle = (typeof EYE_STYLES)[number]
export type Eyewear = (typeof EYEWEAR)[number]
export type Mouth = (typeof MOUTHS)[number]

export interface AvatarFeatures {
  skin: string
  hairStyle: HairStyle
  hairColor: string
  eyes: EyeStyle
  eyewear: Eyewear
  mouth: Mouth
  shirt: string
  freckles: boolean
}

export const MAX_SEED = 2 ** 31 - 1

export function isSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SEED
}

/** Salted hash per feature, so two features never move in lockstep as the seed
 *  increments — without this, consecutive seeds look like near-duplicates. */
function pick<T>(list: readonly T[], seed: number, salt: number): T {
  const h = Math.imul(seed ^ (salt * 0x9e3779b9), 0x85ebca6b) >>> 0
  // >>> 0 again: JS bitwise ops return a SIGNED int, and a negative index
  // silently yields undefined rather than throwing.
  const mixed = (h ^ (h >>> 13)) >>> 0
  return list[mixed % list.length]
}

export function featuresFromSeed(seed: number): AvatarFeatures {
  return {
    skin: pick(SKINS, seed, 1),
    hairStyle: pick(HAIR_STYLES, seed, 2),
    hairColor: pick(HAIR_COLORS, seed, 3),
    eyes: pick(EYE_STYLES, seed, 4),
    // 'none' appears twice in EYEWEAR so most faces have bare eyes.
    eyewear: pick(EYEWEAR, seed, 5),
    mouth: pick(MOUTHS, seed, 6),
    shirt: pick(SHIRTS, seed, 7),
    freckles: pick([true, false, false, false], seed, 8),
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * (MAX_SEED + 1))
}

/** A stable face for anyone who has never rolled one, so no roster row or
 *  ballot entry renders blank. */
export function seedFromPlayerId(playerId: string): number {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) {
    hash = (Math.imul(hash, 31) + playerId.charCodeAt(i)) >>> 0
  }
  return hash % (MAX_SEED + 1)
}
