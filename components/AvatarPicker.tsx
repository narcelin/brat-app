'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from './Avatar'
import { randomSeed, seedFromPlayerId } from '../lib/domain/avatar'

export function AvatarPicker({
  playerId,
  current,
}: {
  playerId: string
  current: number | null
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
      <button className="btn ghost" onClick={keep} disabled={busy || !dirty}>
        {busy ? 'Saving…' : dirty ? 'Keep this one' : 'This is your brat'}
      </button>
    </div>
  )
}
