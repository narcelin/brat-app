import { redirect } from 'next/navigation'
import { currentPlayer } from '../lib/auth/current-player'
import { getCurrentWeek } from '../lib/db/queries'
import { canSubmit } from '../lib/domain/submission-rules'
import { ObjectiveCard } from '../components/ObjectiveCard'
import { WeekStatus } from '../components/WeekStatus'
import { SignInButton } from '@clerk/nextjs'

export default async function ThisWeekPage() {
  const player = await currentPlayer()

  if (!player) {
    return (
      <main className="screen">
        <header>
          <h1>Brat Olympics</h1>
          <p className="sub">Sign in to see this week&apos;s objectives.</p>
        </header>
        <SignInButton mode="modal">
          <button className="btn">Sign in</button>
        </SignInButton>
      </main>
    )
  }

  // First run: a player with no avatar appears on the roster as a face they
  // never chose, so rolling one comes before anything else.
  if (player.avatarSeed === null) redirect('/welcome')

  const week = await getCurrentWeek(player.id)

  if (!week) {
    return (
      <main className="screen">
        <header>
          <h1>no week yet</h1>
          <p className="sub">Nothing has dropped. Check back soon.</p>
        </header>
      </main>
    )
  }

  const open = canSubmit(week.state)

  return (
    <main className="screen">
      <WeekStatus
        number={week.number}
        state={week.state}
        closesAt={week.windows.submissionsCloseAt}
      />
      <div className="stack">
        {week.objectives.map((o) => (
          <ObjectiveCard
            key={o.id}
            id={o.id}
            title={o.title}
            description={o.description}
            tier={o.tier}
            submitted={o.mySubmissionId !== null}
            open={open}
          />
        ))}
      </div>
    </main>
  )
}
