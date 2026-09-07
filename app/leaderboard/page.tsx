import { notFound, redirect } from 'next/navigation'
import { currentPlayer } from '../../lib/auth/current-player'
import { sql } from '../../lib/db/client'
import { getStandings } from '../../lib/db/standings'
import { Avatar } from '../../components/Avatar'

export default async function LeaderboardPage() {
  const player = await currentPlayer()
  if (!player) notFound()
  if (player.avatarSeed === null) redirect('/welcome')

  const [season] = (await sql`
    SELECT id, name FROM seasons WHERE is_active LIMIT 1
  `) as { id: number; name: string }[]

  if (!season) notFound()

  const standings = await getStandings(season.id)

  return (
    <main className="screen">
      <header>
        <h1>standings</h1>
        <p className="sub">{season.name} — only weeks that have finished voting count.</p>
      </header>

      <ol className="standings">
        {standings.map((standing, index) => (
          <li key={standing.userId} className={standing.userId === player.id ? 'is-you' : undefined}>
            <span className="standings-rank">{index + 1}</span>
            <Avatar seed={standing.avatarSeed} className="roster-face" />
            <span className="standings-name">{standing.displayName}</span>
            <span className="standings-medals">
              {standing.golds}🥇 {standing.silvers}🥈 {standing.bronzes}🥉
            </span>
            <b className="standings-points">{standing.points}</b>
          </li>
        ))}
      </ol>
    </main>
  )
}
