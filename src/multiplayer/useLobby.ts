import { createClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { keys, storage } from '../lib/storage'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const client = url && key ? createClient(url, key) : undefined

export type Room = {
  code: string
  players: string[]
  names: string[]
  seen: string[]
  departed: boolean[]
  seconds: number
  state: 'waiting' | 'playing' | 'finished' | 'closed'
  light: number[]
  dark: number[]
  light_slot: number
  turn: number
  deadline: string | null
  winner: number | null
  reason: 'line' | 'timeout' | 'leave' | null
  winning: number[]
  route: number[]
  round: number
  moves: number
  votes: number[]
  revision: number
}

type Command = 'create' | 'join' | 'sync' | 'rename' | 'move' | 'rematch' | 'decline' | 'leave'
type Parameters = {
  room_code?: string
  nickname?: string
  turn_seconds?: number
  origin?: number
  destination?: number
  expected_round?: number
  expected_moves?: number
}
type Response = { room: Room; serverTime: string }

let sessionPending: Promise<string> | undefined
function getIdentity() {
  if (!client) return Promise.reject(new Error('Il servizio multiplayer richiede la configurazione di Supabase.'))
  const backend = client
  sessionPending ??= (async () => {
    const { data } = await backend.auth.getSession()
    if (data.session) return data.session.user.id
    const { data: signed, error } = await backend.auth.signInAnonymously()
    if (error || !signed.user) throw new Error(error?.message ?? 'Sessione non disponibile.')
    return signed.user.id
  })().finally(() => { sessionPending = undefined })
  return sessionPending
}

export function useLobby() {
  const [code, setCode] = useState(() => storage.get(keys.room))
  const [room, setRoom] = useState<Room>()
  const [identity, setIdentity] = useState('')
  const [now, setNow] = useState(0)
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const clock = useRef({ server: 0, sample: performance.now(), sent: -1 })
  const activeCode = useRef(code)
  const pending = useRef(false)

  function accept(next: Room) {
    setRoom(current => current?.code === next.code && current.revision > next.revision ? current : next)
  }

  async function rpc(action: Command, args: Parameters) {
    if (!client) throw new Error('Il servizio multiplayer richiede la configurazione di Supabase.')
    setIdentity(await getIdentity())
    const sent = performance.now()
    const { data, error: failure } = await client.rpc('vagabond_action', { action, ...args })
    if (failure) throw new Error(failure.message)
    const result = data as Response
    const received = performance.now()
    if (sent >= clock.current.sent) {
      clock.current = { server: Date.parse(result.serverTime) + (received - sent) / 2, sample: received, sent }
      setNow(clock.current.server)
    }
    return result.room
  }

  function selectCode(next: string | null) {
    activeCode.current = next
    setCode(next)
    storage.set(keys.room, next)
  }

  async function act(action: Command, args: Parameters = {}) {
    if (pending.current) return false
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await rpc(action, { room_code: code ?? undefined, ...args })
      if (action === 'leave') {
        selectCode(null)
        setRoom(undefined)
      } else {
        if (action === 'create' || action === 'join') selectCode(result.code)
        accept(result)
      }
      return true
    } catch (failure) {
      setError((failure as Error).message)
      return false
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      const { server, sample } = clock.current
      if (server) setNow(server + performance.now() - sample)
    }, 200)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!code || !client) return
    const backend = client
    let disposed = false
    let syncing = false
    setStatus('connecting')

    async function sync() {
      if (syncing || disposed) return
      syncing = true
      try {
        const next = await rpc('sync', { room_code: code! })
        if (disposed || activeCode.current !== code) return
        accept(next)
        setStatus('online')
      } catch (failure) {
        if (disposed || activeCode.current !== code) return
        const message = (failure as Error).message
        if (/lobby (inesistente|non è più disponibile)/i.test(message)) {
          selectCode(null)
          setRoom(undefined)
          setError(message)
        }
        setStatus('offline')
      } finally {
        syncing = false
      }
    }
    const channel = backend.channel(`vagabond:${code}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vagabond_rooms', filter: `code=eq.${code}` }, event => {
        if (!disposed && activeCode.current === code) accept(event.new as Room)
      })
      .subscribe(state => {
        if (disposed) return
        if (state === 'SUBSCRIBED') void sync()
        else setStatus('offline')
      })
    void sync()
    const heartbeat = window.setInterval(sync, 8000)
    const offline = () => setStatus('offline')
    window.addEventListener('online', sync)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', sync)
    return () => {
      disposed = true
      window.clearInterval(heartbeat)
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', sync)
      void backend.removeChannel(channel)
    }
  }, [code])

  return { room, code, identity, now, status, error, busy, act, clearError: () => setError(''), configured: Boolean(client) }
}
