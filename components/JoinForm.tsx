'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CODE_LENGTH, normalizeCode } from '../lib/domain/invite'

export function JoinForm({ initialCode }: { initialCode: string }) {
  const router = useRouter()
  const [code, setCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Checked here only to keep the button from firing an obviously pointless
  // request. The server normalizes and validates again; this is not a guard.
  const looksComplete = normalizeCode(code) !== null

  async function join() {
    setBusy(true)
    setError(null)

    const res = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => null)

    const body = await res?.json().catch(() => null)
    if (!res?.ok) {
      setBusy(false)
      setError(body?.error ?? 'Could not check that code.')
      return
    }

    // Straight to the app; the avatar redirect on / takes it from here.
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="stack">
      <label className="status" htmlFor="invite-code">
        Invite code ({CODE_LENGTH} characters)
      </label>
      <input
        id="invite-code"
        className="admin-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="XXXXXXXXXX"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
      />
      {error && <p className="status admin-error">{error}</p>}
      <button className="btn" disabled={busy || !looksComplete} onClick={join}>
        {busy ? 'Checking…' : 'Join the game'}
      </button>
    </div>
  )
}
