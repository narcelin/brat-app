import { notFound } from 'next/navigation'
import { currentPlayer } from '../../../lib/auth/current-player'
import { getCurrentWeek } from '../../../lib/db/queries'
import { canSubmit } from '../../../lib/domain/submission-rules'
import { medalsFor } from '../../../lib/domain/tiers'
import { SubmitFlow } from '../../../components/SubmitFlow'

export default async function ObjectivePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const objectiveId = Number(id)

  const player = await currentPlayer()
  if (!player) notFound()

  const week = await getCurrentWeek(player.id)
  const objective = week?.objectives.find((o) => o.id === objectiveId)
  if (!week || !objective) notFound()

  const medals = medalsFor(objective.tier)
  const open = canSubmit(week.state)

  return (
    <main className="screen">
      <header>
        <span className={`tier tier-${objective.tier}`}>{objective.tier}</span>
        <h1>{objective.title}</h1>
        {objective.description && <p className="sub">{objective.description}</p>}
        <p className="medals">
          🥇 {medals.first} · 🥈 {medals.second} · 🥉 {medals.third} · effort {medals.effort}
        </p>
      </header>

      {open ? (
        <SubmitFlow objectiveId={objective.id} playerId={player.id} />
      ) : (
        <p className="status">Submissions are closed for this week.</p>
      )}
    </main>
  )
}
