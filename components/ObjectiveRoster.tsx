import Image from 'next/image'
import { avatarSrc } from '../lib/domain/avatars'
import type { RosterEntry } from '../lib/db/queries'

/** Who has posted — never what. Names cannot be copied or one-upped, so this
 *  keeps the hidden-until-reveal rule intact while making the objective page a
 *  place worth landing on rather than a camera that opens in your face. */
export function ObjectiveRoster({
  roster,
  viewerId,
}: {
  roster: RosterEntry[]
  viewerId: string
}) {
  if (roster.length === 0) return null

  const done = roster.filter((r) => r.hasSubmitted).length

  return (
    <section className="roster">
      <h2 className="roster-head">
        {done} of {roster.length} {done === 1 ? 'brat has' : 'brats have'} posted
      </h2>
      <ul className="roster-list">
        {roster.map((r) => (
          <li key={r.userId} className={r.hasSubmitted ? 'is-done' : undefined}>
            <Image
              className="roster-face"
              src={avatarSrc(r.avatarId)}
              alt=""
              width={256}
              height={256}
            />
            <span className="roster-name">
              {r.displayName}
              {r.userId === viewerId && <span className="roster-you"> you</span>}
            </span>
            <span className="roster-state" aria-label={r.hasSubmitted ? 'posted' : 'nothing yet'}>
              {r.hasSubmitted ? '✓ posted' : 'nothing yet'}
            </span>
          </li>
        ))}
      </ul>
      <p className="status">Proof stays hidden until submissions close.</p>
    </section>
  )
}
