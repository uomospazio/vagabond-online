import { useLayoutEffect, useRef, useState } from 'react'
import { coordinates, graph, label, nodes, routesFrom } from '../game/board'

const position = (node: number) => coordinates(node).map(value => 57 + value * 68)
const point = (node: number) => position(node).join(' ')
type Props = {
  light: readonly number[]
  dark: readonly number[]
  turnKey: string
  mine?: 'light' | 'dark'
  winning?: number[]
  route?: number[]
  onMove?: (from: number, to: number) => void
}

export function Board({ light, dark, turnKey, mine, winning, route, onMove }: Props) {
  const [selection, setSelection] = useState<{ key: string; node: number }>()
  const selected = selection?.key === turnKey && mine ? selection.node : undefined
  const allowed = selected === undefined ? new Map<number, number[]>() : routesFrom(selected, [...light, ...dark])
  const moving = useRef<SVGGElement>(null)
  const lastTurn = useRef(turnKey)
  const end = route?.at(-1)
  useLayoutEffect(() => {
    if (lastTurn.current === turnKey) return
    lastTurn.current = turnKey
    if (!route?.length || !moving.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const [x, y] = position(route.at(-1)!)
    const animation = moving.current.animate(route.map(node => {
      const [px, py] = position(node)
      return { transform: `translate(${px - x}px, ${py - y}px)` }
    }), { duration: Math.min(1100, 115 * route.length), easing: 'linear' })
    return () => animation.cancel()
  }, [turnKey])

  function choose(node: number) {
    if (selected !== undefined && allowed.has(node)) {
      onMove?.(selected, node)
      setSelection(undefined)
    } else {
      setSelection(node === selected ? undefined : { key: turnKey, node })
    }
  }

  return <svg className="board" viewBox="0 0 454 454" aria-label="Tabellone Vagabond">
    <defs>
      <linearGradient id="wood" x2=".7" y2="1">
        <stop stopColor="#d7a771"/><stop offset=".55" stopColor="#be8751"/><stop offset="1" stopColor="#ab713e"/>
      </linearGradient>
      <linearGradient id="frame" x2="0" y2="1">
        <stop stopColor="#824b2b"/><stop offset="1" stopColor="#482715"/>
      </linearGradient>
      <radialGradient id="light" cx=".36" cy=".26" r=".77">
        <stop stopColor="#fffdf3"/><stop offset=".65" stopColor="#f3ddb3"/><stop offset="1" stopColor="#b78553"/>
      </radialGradient>
      <radialGradient id="dark" cx=".35" cy=".23" r=".82">
        <stop stopColor="#616c5b"/><stop offset=".65" stopColor="#333c31"/><stop offset="1" stopColor="#1d241e"/>
      </radialGradient>
      <pattern id="grain" width="454" height="11" patternUnits="userSpaceOnUse">
        <path d="M0 4 Q72 1 152 4 T315 4 T454 2 M0 9 Q101 5 209 9 T454 7" fill="none" stroke="#63391d" strokeOpacity=".10"/>
      </pattern>
    </defs>
    <rect x="3" y="3" width="448" height="448" rx="31" fill="url(#frame)"/>
    <rect x="12" y="12" width="430" height="430" rx="23" fill="url(#wood)" stroke="#e2b386"/>
    <rect x="13" y="13" width="428" height="428" rx="22" fill="url(#grain)"/>
    {graph.map((links, from) => links.filter(to => to > from).map(to =>
      <path key={`${from}-${to}`} d={`M${point(from)} L${point(to)}`} className="groove"/>
    ))}
    {winning && winning.length === 4 && <path className="winning-track" d={`M${point(winning[0])} L${point(winning[3])}`}/>}
    {nodes.map(node => {
      const [x, y] = position(node)
      const color = light.includes(node) ? 'light' : dark.includes(node) ? 'dark' : undefined
      const reachable = allowed.has(node)
      const clickable = reachable || Boolean(mine && color === mine)
      return <g key={node} transform={`translate(${x} ${y})`}>
        <circle r="3" fill="#774627"/>
        {reachable && <circle className="destination" r="10"/>}
        {color && <g ref={node === end ? moving : undefined} className={winning?.includes(node) ? 'winning-piece' : undefined}>
          {selected === node && <circle className="selected-piece" r="26"/>}
          <ellipse cy="6" rx="21" ry="20" fill="#21170e" opacity=".43"/>
          <circle r="21" fill={`url(#${color})`} stroke={color === 'light' ? '#8d6039' : '#232a23'} strokeWidth="2"/>
          <circle r="14" fill="none" stroke={color === 'light' ? '#fff7df' : '#a5b598'} opacity=".43" strokeWidth="1.5"/>
          <circle r="10" fill="none" stroke={color === 'light' ? '#a47546' : '#181f18'} opacity=".5"/>
        </g>}
        {clickable && <circle className="hit" r="30" fill="transparent" role="button" tabIndex={0}
          aria-label={`${reachable ? 'Sposta in' : 'Seleziona'} ${label(node)}`}
          aria-pressed={color ? selected === node : undefined}
          onClick={() => choose(node)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(node) }
          }}/>}
      </g>
    })}
  </svg>
}
