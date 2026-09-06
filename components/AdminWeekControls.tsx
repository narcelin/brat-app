'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  FORCEABLE_STATES, canClearOverride, canForceState,
  type ForcedState, type WeekState,
} from '../lib/domain/week-state'

const BLURB: Record<ForcedState, string> = {
  SUBMITTING: 'Objectives visible, proof accepted, everything hidden from others.',
  VOTING: 'Submissions revealed to everyone. No new proof accepted.',
  CLOSED: 'Week finished. Nothing further can change.',
}

export function AdminWeekControls({
  weekId,
  state,
  naturalState,
  forcedState,
}: {
  weekId: number
  state: WeekState
  naturalState: WeekState
  forcedState: ForcedState | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(target: ForcedState | null) {
    setBusy(true)
    setError(null)

    const res = await fetch('/api/admin/week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekId, state: target }),
    }).catch(() => null)

    setBusy(false)

    if (!res?.ok) {
      const body = await res?.json().catch(() => null)
      setError(body?.error ?? 'That did not work.')
      return
    }
    router.refresh()
  }

  const clearable = canClearOverride(state)

  return (
    <div className="stack">
      {error && <p className="status admin-error">{error}</p>}

      {FORCEABLE_STATES.map((target) => {
        const allowed = canForceState(state, target)
        return (
          <button
            key={target}
            className="btn"
            disabled={busy || !allowed.ok}
            onClick={() => send(target)}
            title={allowed.ok ? undefined : allowed.reason}
          >
            <span className="admin-action">Move to {target}</span>
            <span className="admin-blurb">{BLURB[target]}</span>
          </button>
        )
      })}

      {forcedState && (
        <button
          className="btn ghost"
          disabled={busy || !clearable.ok}
          onClick={() => send(null)}
          title={clearable.ok ? undefined : clearable.reason}
        >
          Clear override — back to the schedule ({naturalState})
        </button>
      )}
    </div>
  )
}
