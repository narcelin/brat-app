import { redirect } from 'next/navigation'
import { currentAccess } from '../lib/auth/current-player'
import { getCurrentWeek, getObjectiveRoster } from '../lib/db/queries'
import { canSubmit } from '../lib/domain/submission-rules'
import { ObjectiveCard } from '../components/ObjectiveCard'
import { WeekStatus } from '../components/WeekStatus'
import { SignInButton } from '@clerk/nextjs'

export default async function ThisWeekPage() {
  const access = await currentAccess()

  // Signed in without an invite: the gate, not a sign-in prompt they have
  // already completed.
  if (access.state === 'unadmitted') redirect('/join')

  if (access.state === 'signed-out') {
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

  const player = access.player

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
  // Turnout per card. Who has posted, never what — the roster query selects no
  // media at all, so this is as safe before the reveal as the objective page.
  const rosters = await Promise.all(week.objectives.map((o) => getObjectiveRoster(o.id)))
  const posted = week.objectives.filter((o) => o.mySubmission !== null).length

  return (
    <main className="screen">
      <WeekStatus
        number={week.number}
        state={week.state}
        closesAt={week.windows.submissionsCloseAt}
        posted={posted}
        total={week.objectives.length}
      />
      {week.state === 'VOTING' && (
        <a className="banner" href="/vote">
          <span className="banner-text">
            <b>Everything&apos;s revealed</b>
            <span>Rank every objective — you cannot vote for yourself.</span>
          </span>
          <span className="banner-cta">vote</span>
        </a>
      )}
      <div className="stack">
        {week.objectives.map((o, i) => (
          <ObjectiveCard
            key={o.id}
            id={o.id}
            title={o.title}
            description={o.description}
            tier={o.tier}
            submitted={o.mySubmission !== null}
            open={open}
            roster={rosters[i]}
          />
        ))}
      </div>
    </main>
  )
}
