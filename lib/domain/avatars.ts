/** The cast a player can pick from. Ids are stable and stored on the player,
 *  so renumbering them would silently reassign everyone's face. Add new ones
 *  at the end. */
export const AVATAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const

export type AvatarId = (typeof AVATAR_IDS)[number]

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'number' && (AVATAR_IDS as readonly number[]).includes(value)
}

/** Everyone gets a face even before they choose one, so a ballot never shows a
 *  blank. Derived from the player id so it is stable per player rather than
 *  changing on every render. */
export function fallbackAvatarId(playerId: string): AvatarId {
  let hash = 0
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0
  }
  return AVATAR_IDS[hash % AVATAR_IDS.length]
}

export function avatarSrc(id: AvatarId): string {
  return `/avatars/${id}.png`
}
