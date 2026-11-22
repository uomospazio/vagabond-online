export const size = 6
export const initialPieces = [[2, 11, 24, 33], [3, 6, 29, 32]] as const
export const nodes = Array.from({ length: size * size }, (_, node) => node)
export const coordinates = (node: number) => [node % size, Math.floor(node / size)] as const
export const label = (node: number) => {
  const [x, y] = coordinates(node)
  return `${String.fromCharCode(65 + x)}${y + 1}`
}

const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const inside = (x: number, y: number) => x >= 0 && x < size && y >= 0 && y < size
export const graph = nodes.map(node => {
  const [x, y] = coordinates(node)
  return directions.flatMap(([dx, dy]) => inside(x + dx, y + dy) ? [(y + dy) * size + x + dx] : [])
})

export function routesFrom(origin: number, pieces: readonly number[]) {
  const routes = new Map<number, number[]>([[origin, [origin]]])
  const occupied = new Set(pieces)
  const queue = [origin]
  for (const node of queue) {
    for (const next of graph[node] ?? []) {
      if (occupied.has(next) || routes.has(next)) continue
      routes.set(next, [...routes.get(node)!, next])
      queue.push(next)
    }
  }
  routes.delete(origin)
  return routes
}

export const winningLines = nodes.flatMap(node => {
  const [x, y] = coordinates(node)
  return [[1, 0], [0, 1], [1, 1], [-1, 1]].flatMap(([dx, dy]) =>
    inside(x + 3 * dx, y + 3 * dy)
      ? [Array.from({ length: 4 }, (_, i) => (y + i * dy) * size + x + i * dx)]
      : [],
  )
})

export function winningLine(pieces: readonly number[]) {
  return winningLines.find(line => line.every(node => pieces.includes(node))) ?? []
}
