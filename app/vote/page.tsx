import { notFound, redirect } from 'next/navigation'
import { currentPlayer } from '../../lib/auth/current-player'
import { getBallot, getCurrentWeek } from '../../lib/db/queries'
import { BallotCard } from '../../components/BallotCard'

export default async function VotePage() {
  const player = await currentPlayer()
  if (!player) notFound()
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
