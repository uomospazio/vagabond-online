import { coordinates, initialPieces, routesFrom, winningLine, winningLines } from './board.ts'

export type Color = 'light' | 'dark'
export type Difficulty = 'easy' | 'normal'
type Pieces = Record<Color, readonly number[]>
type Move = { from: number; to: number }
export type SoloGame = {
  pieces: Pieces
  turn: Color
  moves: number
  route: number[]
  winning: number[]
  outcome: Color | 'draw' | null
}

export const otherColor = (color: Color): Color => color === 'light' ? 'dark' : 'light'

export function newSoloGame(): SoloGame {
  return {
    pieces: { light: initialPieces[0], dark: initialPieces[1] },
    turn: 'light', moves: 0, route: [], winning: [], outcome: null,
  }
}

const occupied = (pieces: Pieces) => [...pieces.light, ...pieces.dark]

function movePiece(pieces: Pieces, color: Color, { from, to }: Move): Pieces {
  return { ...pieces, [color]: pieces[color].map(node => node === from ? to : node) }
}

export function playSoloMove(game: SoloGame, color: Color, move: Move): SoloGame {
  if (game.outcome || game.turn !== color || !game.pieces[color].includes(move.from)) return game
  const route = routesFrom(move.from, occupied(game.pieces)).get(move.to)
  if (!route) return game
  const pieces = movePiece(game.pieces, color, move)
  const winning = winningLine(pieces[color])
  const turn = otherColor(color)
  const hasNextMove = pieces[turn].some(node => routesFrom(node, occupied(pieces)).size > 0)
  return {
    pieces, turn, route, winning, moves: game.moves + 1,
    outcome: winning.length ? color : hasNextMove ? null : 'draw',
  }
}

function canWinNext(pieces: Pieces, color: Color) {
  const own = pieces[color]
  const blocked = occupied(pieces)
  for (const line of winningLines) {
    const missing = line.filter(node => !own.includes(node))
    if (missing.length !== 1 || blocked.includes(missing[0])) continue
    const spare = own.find(node => !line.includes(node))
    if (spare !== undefined && routesFrom(spare, blocked).has(missing[0])) return true
  }
  return false
}

function positionScore(pieces: Pieces, color: Color) {
  const own = pieces[color]
  const enemy = pieces[otherColor(color)]
  let score = 0
  for (const line of winningLines) {
    const ours = line.filter(node => own.includes(node)).length
    const theirs = line.filter(node => enemy.includes(node)).length
    if (theirs === 0) score += ours ** 3
    if (ours === 0) score -= theirs ** 3
  }
  for (const node of own) {
    const [x, y] = coordinates(node)
    score -= Math.abs(x - 2.5) + Math.abs(y - 2.5)
  }
  return score
}

export function chooseBotMove(game: SoloGame, difficulty: Difficulty, random = Math.random): Move | undefined {
  if (game.outcome) return
  const { pieces, turn } = game
  const blocked = occupied(pieces)
  const moves = pieces[turn].flatMap(from => [...routesFrom(from, blocked).keys()].map(to => ({ from, to })))
  if (difficulty === 'easy') return moves[Math.floor(random() * moves.length)]

  let best: Move[] = []
  let bestScore = -Infinity
  for (const move of moves) {
    const next = movePiece(pieces, turn, move)
    if (winningLine(next[turn]).length) return move
    const score = positionScore(next, turn) - (canWinNext(next, otherColor(turn)) ? 10_000 : 0)
    if (score > bestScore) {
      bestScore = score
      best = [move]
    } else if (score === bestScore) {
      best.push(move)
    }
  }
  return best[Math.floor(random() * best.length)]
}
