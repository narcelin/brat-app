'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Avatar } from './Avatar'
import { ProofPlayer } from './ProofPlayer'
import { validateBallot } from '../lib/domain/ballot'
import type { BallotObjective } from '../lib/db/queries'

export function BallotCard({
  objective,
  viewerId,
}: {
  objective: BallotObjective
  viewerId: string
}) {
  const router = useRouter()
  const [ranking, setRanking] = useState<string[]>(objective.myRanking)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(objective.myRanking.length > 0)

  const entrantIds = objective.entrants.map((e) => e.userId)
  const check = validateBallot(ranking, entrantIds, viewerId)

  function toggle(userId: string) {
    setSaved(false)
    setRanking((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    )
  }

  async function save() {
    setBusy(true)
    setError(null)

    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectiveId: objective.objectiveId, ranking }),
    }).catch(() => null)

    setBusy(false)
    if (!res?.ok) {
      const body = await res?.json().catch(() => null)
      setError(body?.error ?? 'Could not save that vote.')
      return
    }
    setSaved(true)
    router.refresh()
  }

  async function ratify(approved: boolean) {
    setBusy(true)
    setError(null)

    const res = await fetch('/api/ratify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectiveId: objective.objectiveId, approved }),
    }).catch(() => null)

    setBusy(false)
    if (!res?.ok) {
      const body = await res?.json().catch(() => null)
      setError(body?.error ?? 'Could not save that.')
      return
    }
    setSaved(true)
    router.refresh()
  }

  const lone = objective.entrants[0]

  return (
    <section className="ballot">
      <header>
        <span className={`tier tier-${objective.tier}`}>{objective.tier}</span>
        <h2>{objective.title}</h2>
      </header>

      {objective.isRatify ? (
        <div className="stack">
          <div className="ballot-entry">
            <div className="ballot-who">
              <Avatar seed={lone.avatarSeed} className="roster-face" />
              <b>{lone.displayName}</b>
            </div>
            <ProofPlayer
              pathname={lone.mediaPathname}
              mediaType={lone.mediaType}
              trimStart={lone.trimStart}
              trimEnd={lone.trimEnd}
            />
          </div>

          {lone.userId === viewerId ? (
            <p className="status">Your own entry — the others decide this one.</p>
          ) : (
            <>
              <p className="status">Nobody else entered. Did they actually do it?</p>
              <button className="btn" disabled={busy} onClick={() => ratify(true)}>
                Yes, they did it
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => ratify(false)}>
                No, they did not
              </button>
              {objective.myRatification !== null && (
                <p className="status">
                  You said {objective.myRatification ? 'yes' : 'no'}.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="stack">
          <p className="status">
            Tap in order — best first. {check.ok ? 'Ready to save.' : check.reason}
          </p>

          {objective.entrants.map((entrant) => {
            const position = ranking.indexOf(entrant.userId)
            const isSelf = entrant.userId === viewerId
            return (
              <div key={entrant.userId} className="ballot-entry">
                <div className="ballot-who">
                  <Avatar seed={entrant.avatarSeed} className="roster-face" />
                  <b>{entrant.displayName}</b>
                  {isSelf && <span className="roster-you"> you</span>}
                </div>
                <ProofPlayer
                  pathname={entrant.mediaPathname}
                  mediaType={entrant.mediaType}
                  trimStart={entrant.trimStart}
                  trimEnd={entrant.trimEnd}
                />
                <button
                  className={`btn${position === -1 ? ' ghost' : ''}`}
                  disabled={busy || isSelf}
                  onClick={() => toggle(entrant.userId)}
                >
                  {isSelf
                    ? 'You cannot rank yourself'
                    : position === -1
                      ? 'Rank this one'
                      : `Ranked #${position + 1} — tap to remove`}
                </button>
              </div>
            )
          })}

          {error && <p className="status admin-error">{error}</p>}
          <button className="btn" disabled={busy || !check.ok} onClick={save}>
            {busy ? 'Saving…' : saved ? 'Saved — change it?' : 'Save this vote'}
          </button>
        </div>
      )}

      {error && objective.isRatify && <p className="status admin-error">{error}</p>}
    </section>
  )
}
