import type { WeekState } from '../lib/domain/week-state'
import { LocalTime } from './LocalTime'

const MESSAGE: Record<WeekState, string> = {
  PENDING: 'Next drop coming soon',
  SUBMITTING: 'Submissions open — nobody can see your proof yet',
  VOTING: 'Submissions revealed. Voting is open.',
  CLOSED: 'Week closed',
}

export function WeekStatus({ number, state, closesAt }: {
  number: number
  state: WeekState
  closesAt: Date
}) {
  return (
    <header>
      <h1>week {number}</h1>
      <p className="sub">{MESSAGE[state]}</p>
      {state === 'SUBMITTING' && (
        <p className="status">Closes <LocalTime iso={closesAt.toISOString()} /></p>
      )}
    </header>
  )
}
