import { test } from 'node:test'
import assert from 'node:assert/strict'
import { graph, initialPieces, routesFrom, winningLine } from './board.ts'
import { cleanNickname } from '../lib/storage.ts'

test('quattro pedine per colore, una per zona d’angolo, con simmetria centrale', () => {
  assert.deepEqual(initialPieces, [[2, 11, 24, 33], [3, 6, 29, 32]])
  assert.equal(new Set(initialPieces.flat()).size, 8)
  for (const positions of initialPieces) {
    assert.deepEqual(positions.map(node => 35 - node).sort((a, b) => a - b), positions)
    assert.deepEqual(winningLine(positions), [])
  }
})

test('una mossa può cambiare direzione e ogni segmento appartiene al grafo', () => {
  const route = routesFrom(0, [0, 1]).get(8)!
  assert.deepEqual(route, [0, 6, 7, 8])
  route.slice(1).forEach((node, index) => assert.ok(graph[route[index]].includes(node)))
})

test('una barriera impedisce di raggiungere o saltare pedine e destinazioni occupate', () => {
  const routes = routesFrom(0, [0, 1, 7, 13, 19, 25, 31])
  assert.equal(routes.has(2), false)
  assert.equal(routes.has(1), false)
  assert.equal(routes.has(0), false)
  assert.equal(routes.has(30), true)
  assert.equal(graph[5].includes(6), false)
})

test('riconosce orizzontali, verticali ed entrambe le diagonali, senza attraversare bordi', () => {
  for (const line of [[1, 2, 3, 4], [2, 8, 14, 20], [0, 7, 14, 21], [5, 10, 15, 20]]) {
    assert.deepEqual(winningLine(line), line)
  }
  assert.deepEqual(winningLine([4, 5, 6, 7]), [])
  assert.deepEqual(winningLine([0, 1, 3, 4]), [])
})

test('nickname validi con Unicode e punteggiatura, senza markup o controlli', () => {
  assert.equal(cleanNickname('  È & 🦊  '), 'È & 🦊')
  assert.throws(() => cleanNickname('<script>'))
  assert.throws(() => cleanNickname('A\tB'))
  assert.throws(() => cleanNickname('A'))
  assert.throws(() => cleanNickname('A'.repeat(17)))
})
