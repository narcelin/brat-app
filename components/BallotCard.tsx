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
  readOnly = false,
  revealNames,
}: {
  objective: BallotObjective
  viewerId: string
  /** A settled week. /api/vote and /api/ratify both refuse once a week is
   *  CLOSED, so offering Save and ratify buttons there is offering buttons
   *  that can only ever produce an error. Show the proof and what the viewer
   *  said, and nothing they can press. */
  readOnly?: boolean
  /** Whether entrants are attributed. False while voting, so the proof is
   *  judged before the name is read — reading the name first is where
   *  popularity bias actually bites. True once the week settles, since the
   *  standings name medal winners anyway and knowing who did the unhinged one
   *  is most of the payoff.
   *
   *  Separate from `readOnly` rather than derived from it: they happen to
   *  coincide today, but one is about what you may press and the other about
   *  what you may see. */
  revealNames: boolean
}) {
  const router = useRouter()
  const [ranking, setRanking] = useState<string[]>(objective.myRanking)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(objective.myRanking.length > 0)
  const [myRatification, setMyRatification] = useState(objective.myRatification)

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
    setMyRatification(approved)
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
            {revealNames && (
              <div className="ballot-who">
                <Avatar seed={lone.avatarSeed} className="roster-face" />
                <b>{lone.displayName}</b>
              </div>
            )}
            <ProofPlayer
              pathname={lone.mediaPathname}
              mediaType={lone.mediaType}
              trimStart={lone.trimStart}
              trimEnd={lone.trimEnd}
            />
          </div>

          {readOnly ? (
            <p className="status">
              {lone.userId === viewerId
                ? 'Your own entry. This week is settled.'
                : myRatification === null
                  ? 'This week is settled — you did not weigh in on this one.'
                  : `This week is settled. You said ${myRatification ? 'yes' : 'no'}.`}
            </p>
          ) : lone.userId === viewerId ? (
            <p className="status">Your own entry — the others decide this one.</p>
          ) : (
            <>
              <p className="status">Nobody else entered. Did they actually do it?</p>
              <button
                className={`btn${myRatification === true ? '' : ' ghost'}`}
                disabled={busy}
                onClick={() => ratify(true)}
              >
                Yes, they did it
              </button>
              <button
                className={`btn${myRatification === false ? '' : ' ghost'}`}
                disabled={busy}
                onClick={() => ratify(false)}
              >
                No, they did not
              </button>
              {myRatification !== null && (
                <p className="status">
                  You said {myRatification ? 'yes' : 'no'}.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="stack">
          <p className="status">
            {readOnly
              ? 'This week is settled — voting is over.'
              : `Tap in order — best first. ${check.ok ? 'Ready to save.' : check.reason}`}
          </p>
          {!revealNames && (
            <p className="status">Names are hidden until voting closes.</p>
          )}

          {objective.entrants.map((entrant) => {
            const position = ranking.indexOf(entrant.userId)
            const isSelf = entrant.userId === viewerId
            return (
              <div key={entrant.userId} className="ballot-entry">
                {/* Your own entry stays marked even while names are hidden:
                    it cannot be ranked, and an unrankable card with no
                    explanation just looks broken. */}
                {(revealNames || isSelf) && (
                  <div className="ballot-who">
                    {revealNames && (
                      <>
                        <Avatar seed={entrant.avatarSeed} className="roster-face" />
                        <b>{entrant.displayName}</b>
                      </>
                    )}
                    {isSelf && (
                      <span className="roster-you">{revealNames ? ' you' : 'your proof'}</span>
                    )}
                  </div>
                )}
                <ProofPlayer
                  pathname={entrant.mediaPathname}
                  mediaType={entrant.mediaType}
                  trimStart={entrant.trimStart}
                  trimEnd={entrant.trimEnd}
                />
                {readOnly ? (
                  <p className="status">
                    {isSelf
                      ? 'Your entry.'
                      : position === -1
                        ? 'You did not rank this one.'
                        : `You ranked this #${position + 1}.`}
                  </p>
                ) : (
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
                )}
              </div>
            )
          })}

          {error && <p className="status admin-error">{error}</p>}
          {!readOnly && (
            <button className="btn" disabled={busy || !check.ok} onClick={save}>
              {busy ? 'Saving…' : saved ? 'Saved — change it?' : 'Save this vote'}
            </button>
          )}
        </div>
      )}

      {error && objective.isRatify && <p className="status admin-error">{error}</p>}
    </section>
  )
}
