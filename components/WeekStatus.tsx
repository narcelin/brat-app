import type { WeekState } from '../lib/domain/week-state'
import { LocalTime } from './LocalTime'

const MESSAGE: Record<WeekState, string> = {
  PENDING: 'Next drop coming soon',
  SUBMITTING: 'Submissions open — nobody can see your proof yet',
  VOTING: 'Submissions revealed. Voting is open.',
  CLOSED: 'Week closed',
}

// Short enough for a pill: "Thu 9:00 PM" rather than a full date and seconds.
const CLOSES_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', hour: 'numeric', minute: '2-digit' }

export function WeekStatus({ number, state, closesAt, posted, total }: {
  number: number
  state: WeekState
  closesAt: Date
  /** How many of this week's objectives the viewer has posted for. */
  posted: number
  total: number
}) {
  return (
    <header className="week-head">
      <div className="week-title">
        <h1>week {number}</h1>
        <span className="pill is-solid">
          {state === 'SUBMITTING' ? (
            <>closes <LocalTime iso={closesAt.toISOString()} options={CLOSES_FORMAT} /></>
          ) : state === 'VOTING' ? (
            'voting open'
          ) : state === 'CLOSED' ? (
            'settled'
          ) : (
            'soon'
          )}
        </span>
      </div>

      {state === 'SUBMITTING' && total > 0 ? (
        <div className="progress">
          <p className="progress-label">
            <span>You&apos;ve posted {posted} of {total}</span>
            <span className="progress-note">proof stays hidden</span>
          </p>
          {/* One segment per objective rather than a percentage bar: three is
              few enough to count, and a filled segment maps to a card below. */}
          <div className="progress-track" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < posted ? 'is-done' : undefined} />
            ))}
          </div>
        </div>
      ) : (
        <p className="sub">{MESSAGE[state]}</p>
      )}
    </header>
  )
}
