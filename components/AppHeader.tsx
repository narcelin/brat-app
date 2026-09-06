import Image from 'next/image'
import Link from 'next/link'
import { Show, UserButton } from '@clerk/nextjs'

/** Persistent navigation chrome. The app is only ever two levels deep
 *  (This Week -> an objective), so the wordmark doubles as the back action
 *  and no separate back button is needed.
 *
 *  Rendered in both signed-in and signed-out states so the top spacing and
 *  safe-area inset stay consistent; only the account control is gated. */
export function AppHeader() {
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
        <UserButton
          appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }}
        />
      </Show>
    </header>
  )
}
