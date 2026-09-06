import { notFound } from 'next/navigation'
import { currentPlayer } from '../../lib/auth/current-player'
import { AvatarPicker } from '../../components/AvatarPicker'

export default async function MePage() {
  const player = await currentPlayer()
  if (!player) notFound()

  return (
    <main className="screen">
      <header>
        <h1>{player.displayName}</h1>
        <p className="sub">Pick your brat. Everyone sees it on the roster.</p>
      </header>
      <AvatarPicker current={player.avatarId} />
    </main>
  )
}
