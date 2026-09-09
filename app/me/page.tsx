
import { requirePlayer } from '../../lib/auth/current-player'
import { AvatarPicker } from '../../components/AvatarPicker'

export default async function MePage() {
  const player = await requirePlayer()

  return (
    <main className="screen">
      <header>
        <h1>{player.displayName}</h1>
        <p className="sub">Roll until you get one you can live with. Everyone sees it.</p>
      </header>
      <AvatarPicker playerId={player.id} current={player.avatarSeed} />
    </main>
  )
}
