import { useState } from 'react'

type Props = {
  name: string
  color: 'light' | 'dark'
  active: boolean
  remaining: number | null
  online?: boolean
  busy?: boolean
  onRename?: (name: string) => Promise<boolean>
}

export function Player({ name, color, active, remaining, online, busy, onRename }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  return <section className={`player ${active ? 'active' : ''}`} aria-label={onRename ? 'Tu' : 'Avversario'}>
    <span className={`token ${color}`} aria-label={color === 'light' ? 'Avorio' : 'Verde'} role="img"/>
    <div className="player-info">
      <div className="player-meta">
        {onRename ? 'Tu' : 'Avversario'}
        {online !== undefined && <span className={online ? 'connected' : 'disconnected'}> · {online ? 'Connesso' : 'Disconnesso'}</span>}
      </div>
      {draft !== null ? <form className="rename" onSubmit={async event => {
        event.preventDefault()
        if (await onRename?.(draft)) setDraft(null)
      }}>
        <input autoFocus aria-label="Nuovo nickname" maxLength={32} value={draft} onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Escape') setDraft(null) }}/>
        <button type="submit" disabled={busy}>Salva</button>
      </form> : <div className="player-name"><strong>{name}</strong>{onRename && <button className="icon" aria-label="Modifica nickname" onClick={() => setDraft(name)}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="m15 5 4 4M5 19l1-5L16 4a2.1 2.1 0 0 1 4 4L10 18z"/>
        </svg>
      </button>}</div>}
    </div>
    <div className="player-turn">
      {active && <span>Di turno</span>}
      {remaining !== null && <time className={remaining <= 5 ? 'urgent' : ''}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</time>}
    </div>
  </section>
}
