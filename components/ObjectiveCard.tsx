import Link from 'next/link'
import { medalsFor, type Tier } from '../lib/domain/tiers'

const TIER_LABEL: Record<Tier, string> = {
  easy: 'Easy',
  hard: 'Hard',
  unhinged: 'Unhinged',
}

export function ObjectiveCard({
  id,
  title,
  description,
  tier,
  submitted,
  open,
}: {
  id: number
  title: string
  description: string
  tier: Tier
  submitted: boolean
  open: boolean
}) {
  const medals = medalsFor(tier)

  return (
    <Link href={`/objective/${id}`} className="card">
      <span className={`tier tier-${tier}`}>{TIER_LABEL[tier]}</span>
      <h2>{title}</h2>
      {description && <p className="desc">{description}</p>}
      <p className="medals">
        🥇 {medals.first} · 🥈 {medals.second} · 🥉 {medals.third} · effort {medals.effort}
      </p>
      <p className="state">
        {submitted ? 'Submitted ✓' : open ? 'Not submitted' : 'Closed'}
      </p>
    </Link>
  )
}
