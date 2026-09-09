import { notFound, redirect } from 'next/navigation'
import { requirePlayer } from '../../lib/auth/current-player'
import { sql } from '../../lib/db/client'
import { getStandings } from '../../lib/db/standings'
import { Avatar } from '../../components/Avatar'

export default async function LeaderboardPage() {
  const player = await requirePlayer()
  if (player.avatarSeed === null) redirect('/welcome')

  const [season] = (await sql`
    SELECT id, name FROM seasons WHERE is_active LIMIT 1
  `) as { id: number; name: string }[]

  if (!season) notFound()

  const standings = await getStandings(season.id)

  // Competition ranking, the same rule the objectives themselves use: your
  // position is one more than the number of players who beat you, so a tie
  // shares a number and the next distinct score skips one. Rendering
  // `index + 1` showed two players on identical points as 1 and 2, which
  // contradicts the tie rule the rest of the branch implements. "Beats you"
  // means the same thing here as in buildStandings' sort: more points, or
  // equal points and more golds. The later tiebreaks in that sort (display
  // name, then user id) only fix the row order; they do not break a tie.
  const beats = (a: (typeof standings)[number], b: (typeof standings)[number]) =>
    a.points > b.points || (a.points === b.points && a.golds > b.golds)

  return (
    <main className="screen">
      <header>
        <h1>standings</h1>
        <p className="sub">{season.name} — only weeks that have finished voting count.</p>
      </header>

      <ol className="standings">
        {standings.map((standing) => (
          <li key={standing.userId} className={standing.userId === player.id ? 'is-you' : undefined}>
            <span className="standings-rank">
              {standings.filter((other) => beats(other, standing)).length + 1}
            </span>
            <Avatar seed={standing.avatarSeed} className="roster-face" />
            <span className="standings-name">{standing.displayName}</span>
            <span className="standings-medals">
              {standing.golds}🥇 {standing.silvers}🥈 {standing.bronzes}🥉
            </span>
            {/* Participation, not achievement — kept visually quieter than the
                medals so it never reads as a fourth place above bronze. */}
            <span
              className="standings-entries"
              title={`${standing.entries} ${standing.entries === 1 ? 'objective' : 'objectives'} posted`}
            >
              📸 {standing.entries}
            </span>
            <b className="standings-points">{standing.points}</b>
          </li>
        ))}
      </ol>
    </main>
  )
}
