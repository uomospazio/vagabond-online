export const keys = { nickname: 'vagabond.nickname', room: 'vagabond.room' }

export const storage = {
  get(key: string) {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch { /* Storage may be unavailable in private browsing. */ }
  },
}

export function cleanNickname(input: string) {
  const value = input.replace(/^ +| +$/g, '')
  const length = [...value].length
  if (length < 2 || length > 16 || /[<>\p{Cc}]/u.test(value)) {
    throw new Error('Usa da 2 a 16 caratteri, senza parentesi angolari o caratteri di controllo.')
  }
  return value
}

export function loadNickname() {
  const saved = storage.get(keys.nickname)
  if (saved) {
    try { return cleanNickname(saved) } catch { /* Replace invalid stored values. */ }
  }
  const value = `Giocatore${1000 + crypto.getRandomValues(new Uint16Array(1))[0] % 9000}`
  storage.set(keys.nickname, value)
  return value
}
