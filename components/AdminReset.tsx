'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RESET_PHRASE } from '../lib/domain/reset'

/** The only destructive control in the app, so it is deliberately awkward:
 *  collapsed behind a disclosure, then gated on typing the phrase exactly.
 *  A single mis-tap must not be able to delete a season. */
export function AdminReset({ submissions }: { submissions: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function reset() {
    setBusy(true)
    setError(null)

    const res = await fetch('/api/admin/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
    }).catch(() => null)

    setBusy(false)
    const body = await res?.json().catch(() => null)
    if (!res?.ok) {
      setError(body?.error ?? 'Could not reset the season.')
      return
    }

    setDone(
      `Deleted ${body.submissionsDeleted} submission(s), ` +
        `${body.mediaDeleted} file(s) removed from storage.`,
    )
    setConfirm('')
    setOpen(false)
    router.refresh()
  }

  if (done) {
    return (
      <section className="admin-state">
        <p className="roster-head">Season reset</p>
        <p className="status">{done} Back to week 1.</p>
      </section>
    )
  }

  return (
    <section className="admin-state admin-danger">
      <p className="roster-head">Danger</p>

      {!open ? (
        <>
          <p className="status">
            Wipes every submission, vote and ratification, and restarts the season at
            week 1. Everyone stays signed in and keeps their brat.
          </p>
          <button className="btn ghost" onClick={() => setOpen(true)}>
            Reset the season…
          </button>
        </>
      ) : (
        <>
          <p className="status">
            This deletes <b>{submissions}</b> submission{submissions === 1 ? '' : 's'} and
            their videos permanently. There is no undo. Objectives and players are kept.
          </p>
          <label className="status" htmlFor="reset-confirm">
            Type <b>{RESET_PHRASE}</b> to confirm.
          </label>
          <input
            id="reset-confirm"
            className="admin-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          {error && <p className="status admin-error">{error}</p>}
          <button
            className="btn"
            disabled={busy || confirm !== RESET_PHRASE}
            onClick={reset}
          >
            {busy ? 'Resetting…' : 'Delete everything and restart at week 1'}
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => { setOpen(false); setConfirm('') }}>
            Cancel
          </button>
        </>
      )}
    </section>
  )
}
