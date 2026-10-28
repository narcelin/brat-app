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

  const rankOf = (standing: (typeof standings)[number]) =>
    standings.filter((other) => beats(other, standing)).length + 1

  // A podium of zeroes before anyone has scored is noise, and fewer than three
  // players cannot fill one.
  const podium = standings.length >= 3 && standings[0].points > 0 ? standings.slice(0, 3) : []
  const rest = standings.slice(podium.length)

  return (
    <main className="screen">
      <header>
        <h1>standings</h1>
        <p className="sub">{season.name} — only weeks that have finished voting count.</p>
      </header>

      {podium.length > 0 && (
        <ol className="podium" aria-label="Top three">
          {/* Drawn 2-1-3 so first stands in the middle; CSS `order` moves the
              boxes, so the list itself still reads 1-2-3. */}
          {podium.map((standing, i) => (
            <li
              key={standing.userId}
              className={`podium-${i + 1}${standing.userId === player.id ? ' is-you' : ''}`}
            >
              <Avatar seed={standing.avatarSeed} className="podium-face" />
              <span className="podium-name">{standing.displayName}</span>
              <span className="podium-step">
                <b>{rankOf(standing)}</b>
                <span>{standing.points} pts</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <ol className="standings">
        {rest.map((standing) => (
          <li key={standing.userId} className={standing.userId === player.id ? 'is-you' : undefined}>
            <span className="standings-rank">{rankOf(standing)}</span>
            <Avatar seed={standing.avatarSeed} className="roster-face" />
            <span className="standings-main">
              <span className="standings-name">
                {standing.displayName}
                {standing.userId === player.id && <span className="roster-you"> you</span>}
              </span>
              <span className="standings-medals">
                <span className="medal is-gold">{standing.golds}<span className="sr-only"> gold</span></span>
                <span className="medal is-silver">{standing.silvers}<span className="sr-only"> silver</span></span>
                <span className="medal is-bronze">{standing.bronzes}<span className="sr-only"> bronze</span></span>
                {/* Participation, not achievement — kept visually quieter than the
                    medals so it never reads as a fourth place above bronze. */}
                <span
                  className="standings-entries"
                  title={`${standing.entries} ${standing.entries === 1 ? 'objective' : 'objectives'} posted`}
                >
                  · {standing.entries} posted
                </span>
              </span>
            </span>
            <b className="standings-points">{standing.points}</b>
          </li>
        ))}
      </ol>
    </main>
  )
}
