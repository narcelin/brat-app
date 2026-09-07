'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from './Avatar'
import { randomSeed, seedFromPlayerId } from '../lib/domain/avatar'

export function AvatarPicker({
  playerId,
  current,
  redirectTo,
  saveLabel,
}: {
  playerId: string
  current: number | null
  /** Where to go once saved. Used by onboarding, which must move the player
   *  on; the settings screen stays put. */
  redirectTo?: string
  saveLabel?: string
}) {
  const router = useRouter()
  const saved = current ?? seedFromPlayerId(playerId)

  const [seed, setSeed] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = seed !== saved

  async function keep() {
    setBusy(true)
    setError(null)

    const res = await fetch('/api/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed }),
    }).catch(() => null)

    setBusy(false)

    if (!res?.ok) {
      setError('Could not save that one. Try again.')
      return
    }
    router.refresh()
    if (redirectTo) router.push(redirectTo)
  }

  return (
    <div className="stack">
      <div className="avatar-stage">
        <Avatar seed={seed} className="avatar-large" title="Your brat" />
      </div>

      {error && <p className="status">{error}</p>}

      <button className="btn" onClick={() => setSeed(randomSeed())} disabled={busy}>
        Roll again
      </button>
      <button
        className="btn ghost"
        onClick={keep}
        // Onboarding must be completable without rolling: the face shown on
        // arrival is already a real one, and refusing to save it would trap a
        // player who happens to like it.
        disabled={busy || (!dirty && !redirectTo)}
      >
        {busy ? 'Saving…' : saveLabel ?? (dirty ? 'Keep this one' : 'This is your brat')}
      </button>
    </div>
  )
}
