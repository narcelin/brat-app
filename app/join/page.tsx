import { redirect } from 'next/navigation'
import { SignInButton } from '@clerk/nextjs'
import { currentAccess } from '../../lib/auth/current-player'
import { JoinForm } from '../../components/JoinForm'

/** The invite gate. Everyone signed in without a player row lands here,
 *  whether they followed an invite link or found the site and signed up. The
 *  link only pre-fills the code; it is not itself the gate. */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const access = await currentAccess()
  const { c } = await searchParams

  // Already in: this page would be a dead end they cannot leave forwards.
  if (access.state === 'player') redirect('/')

  if (access.state === 'signed-out') {
    return (
      <main className="screen">
        <header>
          <h1>Brat Olympics</h1>
          <p className="sub">Sign in first, then enter your invite code.</p>
        </header>
        <SignInButton mode="modal">
          <button className="btn">Sign in</button>
        </SignInButton>
      </main>
    )
  }

  return (
    <main className="screen">
      <header>
        <h1>invite only</h1>
        <p className="sub">
          You are signed in as <b>{access.identity.displayName}</b>, but this is a
          private game. Enter the code you were sent.
        </p>
      </header>
      <JoinForm initialCode={c ?? ''} />
    </main>
  )
}
