import { notFound } from 'next/navigation'
import { currentPlayer } from '../../lib/auth/current-player'
import { isAdmin } from '../../lib/auth/is-admin'
import { getCurrentWeek } from '../../lib/db/queries'
import { getTurnout } from '../../lib/db/turnout'
import { AdminWeekControls } from '../../components/AdminWeekControls'
import { LocalTime } from '../../components/LocalTime'

export default async function AdminPage() {
  const player = await currentPlayer()
  // notFound rather than a "forbidden" page: a non-admin should not learn that
  // an admin screen exists here.
  if (!player || !(await isAdmin())) notFound()

  const week = await getCurrentWeek(player.id)
  if (!week) {
    return (
      <main className="screen">
        <header><h1>admin</h1><p className="sub">No week has dropped yet.</p></header>
      </main>
    )
  }

  const turnout = await getTurnout(week.id)

  return (
    <main className="screen">
      <header>
        <h1>admin</h1>
        <p className="sub">Week {week.number}</p>
      </header>

      <section className="admin-state">
        <p className="roster-head">Right now</p>
        <p className="admin-current">{week.state}</p>
        {week.forcedState ? (
          <p className="status">
            Forced by you. The schedule alone would say <b>{week.naturalState}</b>.
          </p>
        ) : (
          <p className="status">
            Running on its schedule. Submissions close{' '}
            <LocalTime iso={week.windows.submissionsCloseAt.toISOString()} />.
          </p>
        )}
      </section>

      <AdminWeekControls
        weekId={week.id}
        state={week.state}
        naturalState={week.naturalState}
        forcedState={week.forcedState}
      />

      {turnout.length > 0 && (
        <section className="admin-state">
          <p className="roster-head">Voting so far</p>
          <ul className="turnout">
            {turnout.map((t) => (
              <li key={t.objectiveId}>
                <span>{t.title}</span>
                <b>{t.voters}/{t.eligible}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
