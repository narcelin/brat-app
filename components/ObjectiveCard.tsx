import Link from 'next/link'
import { medalsFor, type Tier } from '../lib/domain/tiers'
import type { RosterEntry } from '../lib/db/queries'
import { Avatar } from './Avatar'
import { Check } from './Check'

const TIER_LABEL: Record<Tier, string> = {
  easy: 'Easy',
  hard: 'Hard',
  unhinged: 'Unhinged',
}

/** How many faces to stack before the count says the rest. */
const FACES = 3

export function ObjectiveCard({
  id,
  title,
  description,
  tier,
  submitted,
  open,
  roster,
}: {
  id: number
  title: string
  description: string
  tier: Tier
  submitted: boolean
  open: boolean
  /** Who has posted, never what — the same rule as the objective page. */
  roster: RosterEntry[]
}) {
  const medals = medalsFor(tier)
  const posters = roster.filter((r) => r.hasSubmitted)

  return (
    // The tier sets the card's look so the three read as three different
    // stakes at a glance, not three copies of one block.
    <Link href={`/objective/${id}`} className={`card card-${tier}`}>
      <div className="card-top">
        <span className="tier">{TIER_LABEL[tier]}</span>
        {/* The top prize is the number a player weighs up; the full split is
            one tap away on the objective page. */}
        <span className="card-prize"><b>{medals.first}</b> pts top</span>
      </div>
      <h2>{title}</h2>
      {description && <p className="desc">{description}</p>}
      <div className="card-foot">
        <span className={`pill${submitted ? ' is-solid' : ''}`}>
          {submitted ? <><Check /> posted</> : open ? 'not yet' : 'closed'}
        </span>
        <span className="card-turnout">
          {posters.length > 0 && (
            <span className="faces" aria-hidden="true">
              {posters.slice(0, FACES).map((r) => (
                <Avatar key={r.userId} seed={r.avatarSeed} />
              ))}
            </span>
          )}
          {posters.length === 0
            ? 'nobody yet'
            : `${posters.length} of ${roster.length} in`}
        </span>
      </div>
    </Link>
  )
}
