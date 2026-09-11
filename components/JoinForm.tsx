'use client'

import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CODE_LENGTH, normalizeCode } from '../lib/domain/invite'

export function JoinForm({ initialCode }: { initialCode: string }) {
  const router = useRouter()
  const { signOut } = useClerk()
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

      {/* Without this the gate is a trap. Every other route sends an
          un-admitted account straight back here, so someone signed in on the
          wrong account — or with no code at all — had nothing to press and no
          way out but clearing site data. */}
      <p className="status">
        Wrong account, or no code? Sign out and you can use a different one.
      </p>
      <button
        className="btn ghost"
        disabled={busy}
        onClick={() => signOut({ redirectUrl: '/join' })}
      >
        Sign out
      </button>
    </div>
  )
}
