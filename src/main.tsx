import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Board } from './components/Board'
import { SoloMatch } from './components/SoloMatch'
import type { Difficulty } from './game/solo'
import { Player } from './components/Player'
import { initialPieces } from './game/board'
import { cleanNickname, keys, loadNickname, storage } from './lib/storage'
import { useLobby } from './multiplayer/useLobby'
import './styles/main.css'

const timerOptions = [[0, 'Nessun limite'], [15, 'Veloce · 15 s'], [30, 'Normale · 30 s'], [60, 'Lenta · 60 s']] as const
const reasons = { line: 'Quattro pedine in fila.', timeout: 'Il tempo del turno è scaduto.', leave: 'Un giocatore ha abbandonato la partita.' }
type Panel = 'home' | 'create' | 'join' | 'rules' | 'solo'

function App() {
  const game = useLobby()
  const { room, identity, now } = game
  const [nickname, setNickname] = useState(loadNickname)
  const [panel, setPanel] = useState<Panel>('home')
  const [seconds, setSeconds] = useState(30)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [solo, setSolo] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [feedback, setFeedback] = useState('')
  const slot = room ? room.players.indexOf(identity) + 1 : 0

  useEffect(() => {
    if (slot && room) {
      const name = room.names[slot - 1]
      setNickname(name)
      storage.set(keys.nickname, name)
    }
  }, [slot, room?.names[slot - 1]])

  function validate(value: string) {
    setFeedback('')
    try { return cleanNickname(value) } catch (error) {
      setFeedback((error as Error).message)
      return null
    }
  }

  function updateNickname(value: string) {
    setNickname(value)
    try { storage.set(keys.nickname, cleanNickname(value)) } catch { /* Keep the last valid name. */ }
  }

  async function leave() {
    setFeedback('')
    if (await game.act('leave')) setPanel('home')
  }

  function navigate(next: Panel) {
    setFeedback('')
    game.clearError()
    setPanel(next)
  }

  const error = feedback || game.error
  const header = <header className="site-header">
    <div className="wordmark"><span className="brand-mark" aria-hidden="true">✦</span> VAGABOND<span> ONLINE</span></div>
    {room ? <span className="header-detail">Lobby <b>{room.code}</b></span> : <span className="header-detail">{solo ? `Contro il computer · ${difficulty === 'easy' ? 'Facile' : 'Normale'}` : 'Strategia per due'}</span>}
  </header>

  if (solo) {
    return <>{header}<SoloMatch nickname={nickname} difficulty={difficulty} error={feedback}
      onRename={async value => {
        const name = validate(value)
        if (name === null) return false
        updateNickname(name)
        return true
      }}
      onExit={() => { setSolo(false); navigate('home') }}/></>
  }

  if (room && slot && (room.state === 'playing' || room.state === 'finished')) {
    const opponent = 3 - slot
    const finished = room.state === 'finished'
    const remaining = room.deadline && now ? Math.max(0, Math.ceil((Date.parse(room.deadline) - now) / 1000)) : null
    const localColor = room.light_slot === slot ? 'light' : 'dark'
    const opponentOnline = !room.departed[opponent - 1] && now - Date.parse(room.seen[opponent - 1]) < 25000
    const canRematch = !room.departed[opponent - 1] && !room.votes.includes(-1)
    return <>{header}<main className="match">
      <Player name={room.names[opponent - 1]} color={localColor === 'light' ? 'dark' : 'light'}
        active={!finished && room.turn === opponent} remaining={room.turn === opponent ? remaining : null} online={opponentOnline}/>
      <Board light={room.light} dark={room.dark} turnKey={`${room.code}-${room.round}-${room.moves}`}
        mine={!finished && room.turn === slot && game.status === 'online' && !game.busy && remaining !== 0 ? localColor : undefined}
        route={room.route} winning={room.winning}
        onMove={(origin, destination) => { setFeedback(''); void game.act('move', { origin, destination, expected_round: room.round, expected_moves: room.moves }) }}/>
      <Player name={room.names[slot - 1]} color={localColor} active={!finished && room.turn === slot}
        remaining={room.turn === slot ? remaining : null} busy={game.busy} onRename={async value => {
          const name = validate(value)
          return name !== null && await game.act('rename', { nickname: name })
        }}/>
      {game.status !== 'online' && <p className="notice" role="status">Connessione in ripristino…</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {finished ? <section className="result" aria-live="polite">
        <h1>{room.winner === slot ? 'Hai vinto!' : 'Hai perso!'}</h1>
        {room.reason && <p>{reasons[room.reason]}</p>}
        {canRematch ? <>
          <p>{room.votes[slot - 1] === 1 ? 'In attesa dell’avversario…' : room.votes[opponent - 1] === 1 ? 'L’avversario chiede una rivincita.' : 'Vuoi giocare ancora?'}</p>
          <div className="actions">
            <button className="primary" disabled={game.busy || room.votes[slot - 1] === 1} onClick={() => void game.act('rematch', { expected_round: room.round })}>
              {room.votes[opponent - 1] === 1 ? 'Accetta rivincita' : 'Gioca di nuovo'}
            </button>
            {room.votes[opponent - 1] === 1 && room.votes[slot - 1] !== 1 && <button disabled={game.busy}
              onClick={() => void game.act('decline', { expected_round: room.round })}>Rifiuta</button>}
          </div>
        </> : <p>{room.departed[opponent - 1] ? 'L’avversario ha lasciato la lobby.' : 'La rivincita è stata rifiutata.'}</p>}
        <button disabled={game.busy} onClick={() => void leave()}>Torna al menu</button>
      </section> : <div className="match-footer">
        <span>{room.turn === slot ? 'Scegli una pedina e una destinazione.' : 'Attendi la mossa dell’avversario.'}</span>
        <button className="subtle" disabled={game.busy} onClick={() => {
          if (window.confirm('Abbandonare la partita? L’avversario vincerà.')) void leave()
        }}>Abbandona partita</button>
      </div>}
    </main></>
  }

  return <>{header}<main className="landing">
    <section className="menu">
      <p className="eyebrow"><span/> GIOCO DA TAVOLO ONLINE</p>
      <h1>Vagabond <span>Online</span></h1>
      {game.code ? <>
        {room?.state === 'waiting' ? <div className="menu-content">
          <p className="intro">Invita un amico a unirsi alla tua partita.</p>
          <div className="code-panel"><small>Codice lobby</small><strong>{room.code}</strong></div>
          <p className="waiting" role="status"><span/>In attesa dell’avversario…</p>
          <button className="primary" onClick={async () => {
            try { await navigator.clipboard.writeText(room.code); setFeedback('Codice copiato.') }
            catch { setFeedback('Seleziona e copia il codice mostrato sopra.') }
          }}>Copia codice</button>
          <button disabled={game.busy} onClick={() => void leave()}>Annulla lobby</button>
        </div> : <p className="notice" role="status">Riconnessione alla lobby {game.code}…</p>}
      </> : panel === 'rules' ? <div className="menu-content rules">
        <h2>Come si gioca</h2>
        <ol>
          <li>Allinea per primo quattro pedine del tuo colore, in orizzontale, verticale o diagonale.</li>
          <li>A ogni turno scegli una tua pedina e una destinazione evidenziata.</li>
          <li>Puoi cambiare direzione lungo le scanalature libere. Le pedine bloccano il percorso e non si catturano.</li>
          <li>Con un timer attivo, chi esaurisce il tempo perde la partita.</li>
        </ol>
        <button onClick={() => navigate('home')}>Torna al menu</button>
      </div> : <form className="menu-content" onSubmit={async event => {
        event.preventDefault()
        const name = validate(nickname)
        if (!name) return
        if (panel === 'solo') { updateNickname(name); setSolo(true) }
        if (panel === 'create') await game.act('create', { nickname: name, turn_seconds: seconds })
        if (panel === 'join') await game.act('join', { nickname: name, room_code: joinCode.trim().toUpperCase() })
      }}>
        {panel === 'home' && <p className="intro">Trova il tuo percorso. Metti quattro pedine in fila prima del tuo avversario.</p>}
        <label className="field">Il tuo nickname
          <input value={nickname} onChange={event => updateNickname(event.target.value)} onBlur={() => validate(nickname)}
            placeholder="Scegli un nickname" autoComplete="nickname" maxLength={32} required/>
        </label>
        {panel === 'home' ? <div className="menu-buttons">
          <button type="button" className="primary" onClick={() => { if (validate(nickname)) navigate('create') }}>Crea partita</button>
          <button type="button" onClick={() => { if (validate(nickname)) navigate('join') }}>Unisciti a partita</button>
          <button type="button" onClick={() => { if (validate(nickname)) navigate('solo') }}>Gioca contro il computer</button>
          <button type="button" className="subtle" onClick={() => navigate('rules')}>Come si gioca</button>
        </div> : <>
          {panel === 'solo' ? <label className="field">Difficoltà
            <select value={difficulty} onChange={event => setDifficulty(event.target.value === 'easy' ? 'easy' : 'normal')}>
              <option value="easy">Facile</option>
              <option value="normal">Normale</option>
            </select>
          </label> : panel === 'create' ? <label className="field">Tempo per turno
            <select value={seconds} onChange={event => setSeconds(Number(event.target.value))}>
              {timerOptions.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
            </select>
          </label> : <label className="field">Codice lobby
            <input autoFocus value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ABC234" maxLength={6} autoComplete="off" spellCheck={false} required/>
          </label>}
          <button className="primary" disabled={game.busy}>{panel === 'solo' ? 'Inizia partita' : panel === 'create' ? 'Crea lobby' : 'Entra nella lobby'}</button>
          <button type="button" disabled={game.busy} onClick={() => navigate('home')}>Indietro</button>
        </>}
      </form>}
      {feedback === 'Codice copiato.' ? <p className="notice" role="status">{feedback}</p> : error && <p className="notice error" role="alert">{error}</p>}
      {!game.configured && <p className="notice">Multiplayer da configurare con Supabase.</p>}
    </section>
    <aside className="showcase" aria-label="Anteprima della plancia">
      <div className="showcase-board"><Board light={initialPieces[0]} dark={initialPieces[1]} turnKey="preview"/></div>
      <div className="showcase-caption"><span className="mini-tokens" aria-hidden="true"><i/><i/></span> Disposizione iniziale</div>
    </aside>
  </main></>
}

createRoot(document.getElementById('root')!).render(<App/>)
