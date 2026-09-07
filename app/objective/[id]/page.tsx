import { notFound, redirect } from 'next/navigation'
import { currentPlayer } from '../../../lib/auth/current-player'
import { getCurrentWeek, getObjectiveRoster } from '../../../lib/db/queries'
import { canSubmit } from '../../../lib/domain/submission-rules'
import { medalsFor } from '../../../lib/domain/tiers'
import { ObjectiveRoster } from '../../../components/ObjectiveRoster'
import { SubmitPanel } from '../../../components/SubmitPanel'

const TIER_LABEL = { easy: 'Easy', hard: 'Hard', unhinged: 'Unhinged' } as const

export default async function ObjectivePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const objectiveId = Number(id)

  const player = await currentPlayer()
  if (!player) notFound()

  if (player.avatarSeed === null) redirect('/welcome')

  const week = await getCurrentWeek(player.id)
  const objective = week?.objectives.find((o) => o.id === objectiveId)
  if (!week || !objective) notFound()

  const medals = medalsFor(objective.tier)
  const open = canSubmit(week.state)
  const roster = await getObjectiveRoster(objective.id)

  return (
    <main className="screen">
      <header>
        <span className={`tier tier-${objective.tier}`}>{TIER_LABEL[objective.tier]}</span>
        <h1 className="objective-title">{objective.title}</h1>
        {objective.description && <p className="sub">{objective.description}</p>}
        <ul className="medal-row">
          <li><b>{medals.first}</b> 1st</li>
          <li><b>{medals.second}</b> 2nd</li>
          <li><b>{medals.third}</b> 3rd</li>
          <li><b>{medals.effort}</b> effort</li>
        </ul>
      </header>

      {open ? (
        <SubmitPanel
          objectiveId={objective.id}
          playerId={player.id}
          alreadySubmitted={objective.mySubmissionId !== null}
        />
      ) : (
        <p className="status">Submissions are closed for this week.</p>
      )}

      <ObjectiveRoster roster={roster} viewerId={player.id} />
    </main>
  )
}
