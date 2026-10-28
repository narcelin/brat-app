import { notFound, redirect } from 'next/navigation'
import { requirePlayer } from '../../lib/auth/current-player'
import { getBallot, getCurrentWeek } from '../../lib/db/queries'
import { BallotCard } from '../../components/BallotCard'

export default async function VotePage() {
  const player = await requirePlayer()
  if (player.avatarSeed === null) redirect('/welcome')

  const week = await getCurrentWeek(player.id)
  if (!week) notFound()

  if (week.state !== 'VOTING' && week.state !== 'CLOSED') {
    return (
      <main className="screen">
        <header>
          <h1>not yet</h1>
          <p className="sub">
            Voting opens when submissions close. Nobody can see anyone else&apos;s
            proof until then.
          </p>
        </header>
      </main>
    )
  }

  const ballot = await getBallot(week.id, player.id)

  return (
    <main className="screen">
      <header>
        <h1>vote</h1>
        <p className="sub">
          Week {week.number}. {week.state === 'CLOSED' ? 'This week is settled.' : 'Rank the best — you cannot vote for yourself.'}
        </p>
      </header>

      {/* Jump links rather than tabs: every ballot stays on the page, so a
          half-finished one is never hidden behind an unselected tab. */}
      {ballot.length > 1 && (
        <nav className="jump" aria-label="Objectives">
          {ballot.map((objective) => (
            <a key={objective.objectiveId} href={`#objective-${objective.objectiveId}`}>
              {objective.tier}
            </a>
          ))}
        </nav>
      )}

      {ballot.length === 0 ? (
        <p className="status">Nobody posted anything this week.</p>
      ) : (
        ballot.map((objective) => (
          // A closed week is read-only: /api/vote and /api/ratify both 403
          // once the week settles, so live buttons here could only ever fail.
          <BallotCard
            key={objective.objectiveId}
            objective={objective}
            viewerId={player.id}
            readOnly={week.state === 'CLOSED'}
            revealNames={week.state === 'CLOSED'}
          />
        ))
      )}
    </main>
  )
}
