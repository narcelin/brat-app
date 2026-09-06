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
          <h1>brats</h1>
          <p className="sub">Brat Olympics</p>
        </header>
        <SignInButton mode="modal">
          <button className="btn">Sign in</button>
        </SignInButton>
      </main>
    )
  }

  const week = await getCurrentWeek(player.id)

  if (!week) {
    return (
      <main className="screen">
        <header>
          <h1>brats</h1>
          <p className="sub">No week has dropped yet.</p>
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
