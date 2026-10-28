import { notFound, redirect } from 'next/navigation'
import { requirePlayer } from '../../../lib/auth/current-player'
import { getCurrentWeek, getObjectiveRoster } from '../../../lib/db/queries'
import { canSubmit } from '../../../lib/domain/submission-rules'
import { medalsFor } from '../../../lib/domain/tiers'
import { ObjectiveRoster } from '../../../components/ObjectiveRoster'
import { ProofPlayer } from '../../../components/ProofPlayer'
import { SubmitPanel } from '../../../components/SubmitPanel'

const TIER_LABEL = { easy: 'Easy', hard: 'Hard', unhinged: 'Unhinged' } as const

export default async function ObjectivePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const objectiveId = Number(id)

  const player = await requirePlayer()

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
        <span className={`tier-badge tier-${objective.tier}`}>{TIER_LABEL[objective.tier]}</span>
        <h1 className="objective-title">{objective.title}</h1>
        {objective.description && <p className="sub">{objective.description}</p>}
      </header>

      {/* The four payouts as a table of figures: the numbers are what a player
          is actually weighing up, and first place is the one to chase. */}
      <dl className="points-grid">
        <div className="is-top"><dt>1st</dt><dd>{medals.first}</dd></div>
        <div><dt>2nd</dt><dd>{medals.second}</dd></div>
        <div><dt>3rd</dt><dd>{medals.third}</dd></div>
        <div><dt>effort</dt><dd>{medals.effort}</dd></div>
      </dl>

      {/* Your own proof, played back before the reveal. Deciding whether to
          replace a take is impossible from memory — and this leaks nothing,
          because the only submission ever shaped into the page is your own. */}
      {objective.mySubmission && (
        <section className="mine">
          <h2 className="mine-head">What you posted</h2>
          <ProofPlayer
            pathname={objective.mySubmission.mediaPathname}
            mediaType={objective.mySubmission.mediaType}
            trimStart={objective.mySubmission.trimStart}
            trimEnd={objective.mySubmission.trimEnd}
          />
        </section>
      )}

      <ObjectiveRoster roster={roster} viewerId={player.id} />

      {/* Last in the flow and sticky, so the action sits in thumb reach above
          the tab bar however long the roster gets. */}
      <div className="dock">
        {open ? (
          <SubmitPanel
            objectiveId={objective.id}
            playerId={player.id}
            alreadySubmitted={objective.mySubmission !== null}
          />
        ) : (
          <p className="status">Submissions are closed for this week.</p>
        )}
      </div>
    </main>
  )
}
