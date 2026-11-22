import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseBotMove, newSoloGame, playSoloMove } from './solo.ts'

test('la partita locale convalida turno, proprietà e percorso', () => {
  const start = newSoloGame()
  assert.equal(playSoloMove(start, 'dark', { from: 3, to: 9 }), start)
  assert.equal(playSoloMove(start, 'light', { from: 3, to: 9 }), start)
  assert.equal(playSoloMove(start, 'light', { from: 2, to: 3 }), start)
  const moved = playSoloMove(start, 'light', { from: 2, to: 8 })
  assert.equal(moved.turn, 'dark')
  assert.deepEqual(moved.route, [2, 8])
  assert.equal(moved.moves, 1)
  assert.deepEqual(start.pieces.light, [2, 11, 24, 33])
  for (const difficulty of ['easy', 'normal'] as const) {
    const botMove = chooseBotMove(moved, difficulty, () => 0)!
    assert.ok(botMove)
    assert.equal(playSoloMove(moved, 'dark', botMove).moves, 2)
  }
})

test('il bot normale coglie una vittoria immediata e la partita finisce', () => {
  const game = { ...newSoloGame(), turn: 'dark' as const, pieces: { light: [7, 11, 24, 33], dark: [0, 1, 2, 9] } }
  const move = chooseBotMove(game, 'normal', () => 0)!
  const won = playSoloMove(game, 'dark', move)
  assert.equal(won.outcome, 'dark')
  assert.deepEqual(won.winning, [0, 1, 2, 3])
  assert.equal(chooseBotMove(won, 'normal'), undefined)
})

test('il bot normale blocca una minaccia di vittoria quando può', () => {
  const game = { ...newSoloGame(), turn: 'dark' as const, pieces: { light: [0, 1, 2, 9], dark: [5, 19, 24, 34] } }
  const move = chooseBotMove(game, 'normal', () => 0)!
  const defended = playSoloMove(game, 'dark', move)
  assert.equal(defended.outcome, null)
  assert.equal(playSoloMove(defended, 'light', { from: 9, to: 3 }), defended)
})

test('una mossa che blocca tutte le pedine avversarie chiude la partita in pareggio', () => {
  const game = { ...newSoloGame(), pieces: { light: [2, 8, 12, 14], dark: [0, 1, 6, 7] } }
  const result = playSoloMove(game, 'light', { from: 14, to: 13 })
  assert.equal(result.outcome, 'draw')
  assert.equal(result.turn, 'dark')
})
