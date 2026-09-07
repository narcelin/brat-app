import { notFound, redirect } from 'next/navigation'
import { currentPlayer } from '../../lib/auth/current-player'
import { AvatarPicker } from '../../components/AvatarPicker'

export default async function WelcomePage() {
  const player = await currentPlayer()
  if (!player) notFound()

  // Already rolled: nothing to onboard. Sending them here again would be a
  // dead end they cannot leave by going forward.
  if (player.avatarSeed !== null) redirect('/')

  return (
    <main className="screen">
      <header>
        <h1>welcome</h1>
        <p className="sub">
          You are <b>{player.displayName}</b>. Roll a brat — it is how everyone
          will recognise you on the roster and on the ballot.
        </p>
      </header>
      <AvatarPicker
        playerId={player.id}
        current={player.avatarSeed}
        redirectTo="/"
        saveLabel="This is me"
      />
    </main>
  )
}
