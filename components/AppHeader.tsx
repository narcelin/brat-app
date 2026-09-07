import Image from 'next/image'
import Link from 'next/link'
import { Show, UserButton } from '@clerk/nextjs'
import { currentPlayer } from '../lib/auth/current-player'
import { isAdmin } from '../lib/auth/is-admin'
import { seedFromPlayerId } from '../lib/domain/avatar'
import { Avatar } from './Avatar'

/** Persistent navigation chrome. The app is only ever two levels deep
 *  (This Week -> an objective), so the wordmark doubles as the back action
 *  and no separate back button is needed.
 *
 *  Rendered in both signed-in and signed-out states so the top spacing and
 *  safe-area inset stay consistent; only the account control is gated. */
export async function AppHeader() {
  const player = await currentPlayer()
  // Checked server-side, same as the page itself. Non-admins never see the
  // link and would 404 on the route anyway.
  const admin = player ? await isAdmin() : false

  return (
    <header className="appbar">
      <Link href="/" className="wordmark" aria-label="Brapids — this week">
        <Image
          src="/icons/wordmark.png"
          alt="Brapids"
          width={825}
          height={300}
          priority
        />
      </Link>
      <Show when="signed-in">
        {admin && (
          <Link href="/admin" className="header-admin" aria-label="Admin controls">
            admin
          </Link>
        )}
        {player && (
          <span className="header-face" aria-hidden="true">
            <Avatar seed={player.avatarSeed ?? seedFromPlayerId(player.id)} />
          </span>
        )}
        <UserButton
          appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }}
          // Folds the roller into Clerk's own account menu rather than having
          // two account controls side by side in the header.
          customMenuItems={[{ label: 'Change my brat', href: '/me' }]}
        />
      </Show>
    </header>
  )
}
