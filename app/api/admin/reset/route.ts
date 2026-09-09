import { del } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { currentPlayer } from '../../../../lib/auth/current-player'
import { isAdmin } from '../../../../lib/auth/is-admin'
import { sql } from '../../../../lib/db/client'
import { isResetConfirmed } from '../../../../lib/domain/reset'

/** Wipes the active season back to the start of week 1.
 *
 *  Deletes every submission, vote and ratification, clears every admin
 *  override, moves the schedule so week 1 drops now, and deletes the media
 *  from the store. Users, their avatars and their Clerk sessions are left
 *  alone — everyone stays signed in.
 *
 *  votes and ratifications reference objectives and users, NOT submissions,
 *  so deleting submissions does not cascade to them. Left behind they would
 *  score a season whose proof no longer exists. They are deleted explicitly,
 *  and first, so no window exists where votes outlive their submissions.
 *
 *  Objectives and weeks are kept: the point is to replay the same season, not
 *  to rebuild it. */
export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Not an admin' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!isResetConfirmed((body as { confirm?: unknown } | null)?.confirm)) {
    return NextResponse.json(
      { error: 'Reset needs the confirmation phrase.' },
      { status: 400 },
    )
  }

  const [season] = (await sql`
    SELECT id FROM seasons WHERE is_active LIMIT 1
  `) as { id: number }[]
  if (!season) {
    return NextResponse.json({ error: 'No active season' }, { status: 400 })
  }

  // Read the pathnames BEFORE deleting the rows: once they are gone there is
  // nothing left to say which blobs belonged to this season, and they would
  // be orphaned in the store forever.
  const media = (await sql`
    SELECT s.media_pathname
    FROM submissions s
    JOIN objectives o ON o.id = s.objective_id
    JOIN weeks w ON w.id = o.week_id AND w.season_id = ${season.id}
    WHERE s.media_pathname IS NOT NULL
  `) as { media_pathname: string }[]

  // One transaction: a half-reset — votes gone, submissions kept, or a
  // schedule moved without the data cleared — is worse than no reset.
  //
  // The constraint has to be deferred: weeks are contiguous, so shifting the
  // season moves the first week onto the second's slot before the second has
  // moved. The end state is valid; the intermediate rows are not. An
  // overlapping END state still fails at commit.
  await sql.transaction([
    sql`SET CONSTRAINTS weeks_no_overlap DEFERRED`,

    sql`DELETE FROM votes v USING objectives o, weeks w
        WHERE v.objective_id = o.id AND o.week_id = w.id AND w.season_id = ${season.id}`,

    sql`DELETE FROM ratifications r USING objectives o, weeks w
        WHERE r.objective_id = o.id AND o.week_id = w.id AND w.season_id = ${season.id}`,

    sql`DELETE FROM submissions s USING objectives o, weeks w
        WHERE s.objective_id = o.id AND o.week_id = w.id AND w.season_id = ${season.id}`,

    // Shifted by the gap between week 1's drop and now, so the whole season
    // keeps its existing cadence and simply restarts. Computed inside the
    // statement so every row moves by the identical amount.
    sql`UPDATE weeks SET
          forced_state = NULL,
          drops_at = weeks.drops_at + (now() - first.drops_at),
          submissions_close_at = weeks.submissions_close_at + (now() - first.drops_at),
          voting_closes_at = weeks.voting_closes_at + (now() - first.drops_at)
        FROM (
          SELECT drops_at FROM weeks
          WHERE season_id = ${season.id} AND number = 1
        ) AS first
        WHERE weeks.season_id = ${season.id}`,
  ])

  // After the commit, and best-effort: the database is already consistent, so
  // a storage failure must not report a reset that did happen as failed. Any
  // blob missed here is reclaimable with scripts/sweep-orphan-blobs.mjs.
  let mediaDeleted = 0
  for (const row of media) {
    try {
      await del(row.media_pathname)
      mediaDeleted += 1
    } catch {
      // best-effort only
    }
  }

  return NextResponse.json({
    ok: true,
    submissionsDeleted: media.length,
    mediaDeleted,
  })
}
