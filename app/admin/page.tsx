import { notFound } from 'next/navigation'
import { requirePlayer } from '../../lib/auth/current-player'
import { isAdmin } from '../../lib/auth/is-admin'
import { sql } from '../../lib/db/client'
import { getCurrentWeek } from '../../lib/db/queries'
import { listInvites } from '../../lib/db/invites'
import { getTurnout } from '../../lib/db/turnout'
import { headers } from 'next/headers'
import { AdminInvites } from '../../components/AdminInvites'
import { AdminReset } from '../../components/AdminReset'
import { AdminWeekControls } from '../../components/AdminWeekControls'
import { LocalTime } from '../../components/LocalTime'

export default async function AdminPage() {
  const player = await requirePlayer()
  // notFound rather than a "forbidden" page: a non-admin should not learn that
  // an admin screen exists here.
  if (!(await isAdmin())) notFound()

  const week = await getCurrentWeek(player.id)
  if (!week) {
    return (
      <main className="screen">
        <header><h1>admin</h1><p className="sub">No week has dropped yet.</p></header>
      </main>
    )
  }

  const turnout = await getTurnout(week.id)

  const now = new Date()
  const invites = await listInvites()
  const inviteViews = invites.map((i) => ({
    code: i.code,
    expiresAt: i.expiresAt.toISOString().slice(0, 10),
    maxUses: i.maxUses,
    uses: i.uses,
    revoked: i.revokedAt !== null,
    live: i.revokedAt === null && i.expiresAt > now && i.uses < i.maxUses,
  }))

  // Built from the request rather than hardcoded, so the copied link is
  // correct on the preview deployments as well as the custom domain.
  const host = (await headers()).get('host') ?? 'brats.anico.dev'
  const origin = `https://${host}`

  const [counts] = (await sql`
    SELECT count(*)::int AS submissions
    FROM submissions s
    JOIN objectives o ON o.id = s.objective_id
    JOIN weeks w ON w.id = o.week_id
    JOIN seasons se ON se.id = w.season_id AND se.is_active
  `) as { submissions: number }[]

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

      <AdminInvites invites={inviteViews} origin={origin} />

      <AdminReset submissions={counts.submissions} />
    </main>
  )
}
