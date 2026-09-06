'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AVATAR_IDS, avatarSrc, type AvatarId } from '../lib/domain/avatars'

export function AvatarPicker({ current }: { current: AvatarId | null }) {
  const router = useRouter()
  const [chosen, setChosen] = useState<AvatarId | null>(current)
  const [busy, setBusy] = useState<AvatarId | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick(id: AvatarId) {
    setBusy(id)
    setError(null)
    // Optimistic: the grid is the whole screen, so waiting on a round trip
    // before showing the selection feels broken.
    const previous = chosen
    setChosen(id)

    const res = await fetch('/api/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarId: id }),
    }).catch(() => null)

    setBusy(null)

    if (!res?.ok) {
      setChosen(previous)
      setError('Could not save that. Try again.')
      return
    }
    router.refresh()
  }

  return (
    <div className="stack">
      {error && <p className="status">{error}</p>}
      <ul className="avatar-grid">
        {AVATAR_IDS.map((id) => (
          <li key={id}>
            <button
              type="button"
              className={`avatar-choice${chosen === id ? ' is-chosen' : ''}`}
              onClick={() => pick(id)}
              disabled={busy !== null}
              aria-pressed={chosen === id}
              aria-label={`Avatar ${id}`}
            >
              <Image src={avatarSrc(id)} alt="" width={256} height={256} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
