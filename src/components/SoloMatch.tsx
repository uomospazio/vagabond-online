import { useEffect, useState } from 'react'
import { Board } from './Board'
import { Player } from './Player'
import { chooseBotMove, newSoloGame, otherColor, playSoloMove, type Color, type Difficulty } from '../game/solo'

type Props = {
  nickname: string
  difficulty: Difficulty
  error: string
  onRename: (value: string) => Promise<boolean>
  onExit: () => void
}

export function SoloMatch({ nickname, difficulty, error, onRename, onExit }: Props) {
  const [game, setGame] = useState(newSoloGame)
  const [human, setHuman] = useState<Color>('light')
  const [round, setRound] = useState(1)
  const bot = otherColor(human)
  const humanTurn = !game.outcome && game.turn === human

  useEffect(() => {
    if (game.outcome || game.turn !== bot) return
    const timer = window.setTimeout(() => {
      const move = chooseBotMove(game, difficulty)
      setGame(current => {
        if (current !== game) return current
        return move ? playSoloMove(current, bot, move) : { ...current, outcome: 'draw' }
      })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [game, bot, difficulty])

  function rematch() {
    setHuman(otherColor(human))
    setGame(newSoloGame())
    setRound(round + 1)
  }

  return <main className="match">
    <Player name="Computer" color={bot} active={!game.outcome && game.turn === bot} remaining={null}/>
    <Board light={game.pieces.light} dark={game.pieces.dark} turnKey={`solo-${round}-${game.moves}`}
      mine={humanTurn ? human : undefined} winning={game.winning} route={game.route}
      onMove={(from, to) => setGame(current => playSoloMove(current, human, { from, to }))}/>
    <Player name={nickname} color={human} active={humanTurn} remaining={null} onRename={onRename}/>
    {error && <p className="notice error" role="alert">{error}</p>}
    {game.outcome ? <section className="result" aria-live="polite">
      <h1>{game.outcome === 'draw' ? 'Pareggio' : game.outcome === human ? 'Hai vinto!' : 'Hai perso!'}</h1>
      <p>{game.outcome === 'draw' ? 'Il giocatore di turno non ha mosse disponibili.' : 'Quattro pedine in fila.'}</p>
      <div className="actions">
        <button className="primary" onClick={rematch}>Gioca di nuovo</button>
        <button onClick={onExit}>Torna al menu</button>
      </div>
    </section> : <div className="match-footer">
      <span role="status">{humanTurn ? 'Scegli una pedina e una destinazione.' : 'Il computer sta scegliendo una mossa…'}</span>
      <button className="subtle" onClick={onExit}>Torna al menu</button>
    </div>}
  </main>
}
